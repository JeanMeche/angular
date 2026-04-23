/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  AST,
  ASTWithSource,
  Binary,
  BindingPipe,
  BindingType,
  Call,
  Chain,
  Conditional,
  ImplicitReceiver,
  Interpolation,
  KeyedRead,
  LiteralArray,
  LiteralMap,
  LiteralPrimitive,
  NonNullAssert,
  parseTemplate,
  PrefixNot,
  PropertyRead,
  RecursiveAstVisitor,
  SafeCall,
  SafeKeyedRead,
  SafePropertyRead,
  TmplAstBoundAttribute,
  TmplAstBoundDeferredTrigger,
  TmplAstBoundEvent,
  TmplAstBoundText,
  TmplAstDeferredTrigger,
  TmplAstElement,
  TmplAstForLoopBlock,
  TmplAstIfBlockBranch,
  TmplAstLetDeclaration,
  TmplAstRecursiveVisitor,
  TmplAstSwitchBlock,
  TmplAstSwitchBlockCase,
  TmplAstSwitchBlockCaseGroup,
  TmplAstTemplate,
  TmplAstTextAttribute,
} from '@angular/compiler';
import {AbsoluteFsPath} from '@angular/compiler-cli';
import ts from 'typescript';
import {NgComponentTemplateVisitor} from '../../utils/ng_component_template';
import {getAngularDecorators} from '../../utils/ng_decorators';
import {
  confirmAsSerializable,
  ProgramInfo,
  projectFile,
  ProjectFile,
  Replacement,
  Serializable,
  TextUpdate,
  TsurgeFunnelMigration,
} from '../../utils/tsurge';
import {getPropertyNameText} from '../../utils/typescript/property_name';

import('@angular/compiler');

export interface CompilationUnitData {
  replacements: Replacement[];
}

export interface MigrationConfig {
  /**
   * Whether to migrate this component template to self-closing tags.
   */
  shouldMigrate?: (containingFile: ProjectFile) => boolean;
}

/**
 * This migration wraps optional chaining expressions in Angular templates with a call to the $safeNavigationMigration() magic function.
 * This function doesn't exist at runtime, but is used as a marker for the Angular compiler to transform
 * the expression to keep the legacy behavior of returning `null`.
 *
 * The migration uses several heuritics to determine whether an optional chaining expression should be migrated
 */
export class SafeOptionalChainingMigration extends TsurgeFunnelMigration<
  CompilationUnitData,
  CompilationUnitData
> {
  constructor(private readonly config: MigrationConfig = {}) {
    super();
  }

  override async analyze(info: ProgramInfo): Promise<Serializable<CompilationUnitData>> {
    const replacements: Replacement[] = [];

    // Template Iteration
    const templateVisitor = new NgComponentTemplateVisitor(info.program.getTypeChecker());
    for (const sourceFile of info.sourceFiles) {
      templateVisitor.visitNode(sourceFile);
    }

    for (const template of templateVisitor.resolvedTemplates) {
      const nodes = parseTemplate(template.content, template.filePath.toString(), {
        preserveWhitespaces: true,
      }).nodes;
      const file = template.inline
        ? projectFile(template.container.getSourceFile(), info)
        : projectFile(template.filePath as AbsoluteFsPath, info);

      const exprMigrator = new ExpressionMigrator(file, template.start);
      const visitor = new TmplVisitor(exprMigrator);

      for (const node of nodes) {
        if (node.visit) {
          node.visit(visitor);
        }
      }

      replacements.push(...exprMigrator.replacements);
    }

    for (const sourceFile of info.sourceFiles) {
      replacements.push(...migrateHostBindingsInSourceFile(sourceFile, info));
    }

    return confirmAsSerializable({replacements});
  }

  override async combine(
    unitA: CompilationUnitData,
    unitB: CompilationUnitData,
  ): Promise<Serializable<CompilationUnitData>> {
    const seen = new Set<string>();
    const deduped: Replacement[] = [];

    for (const r of [...unitA.replacements, ...unitB.replacements]) {
      const key = `${r.projectFile.rootRelativePath}:${r.update.data.position}:${r.update.data.end}:${r.update.data.toInsert}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    return confirmAsSerializable({replacements: deduped});
  }

  override async globalMeta(data: CompilationUnitData): Promise<Serializable<CompilationUnitData>> {
    return confirmAsSerializable(data);
  }

  override async stats(data: CompilationUnitData) {
    return confirmAsSerializable({});
  }

  override async migrate(data: CompilationUnitData) {
    return {replacements: data.replacements};
  }
}

function migrateHostBindingsInSourceFile(
  sourceFile: ts.SourceFile,
  info: ProgramInfo,
): Replacement[] {
  const replacements: Replacement[] = [];
  const file = projectFile(sourceFile, info);
  const typeChecker = info.program.getTypeChecker();

  class HostBindingVisitor extends TmplAstRecursiveVisitor {
    constructor(private hostExprMigrator: ExpressionMigrator) {
      super();
    }

    override visitBoundAttribute(attribute: TmplAstBoundAttribute) {
      if (attribute.name === 'ngIf') {
        if (hasNullCheckInAST(attribute.value)) {
          attribute.value.visit(this.hostExprMigrator);
        }
      } else if (attribute.name === 'ngForOf') {
        // skip
      } else if (
        attribute.type === BindingType.Class ||
        attribute.type === BindingType.Style ||
        attribute.type === BindingType.Attribute ||
        (attribute.type === BindingType.Property &&
          (attribute.name === 'class' ||
            attribute.name === 'className' ||
            attribute.name === 'style'))
      ) {
        if (hasPipeOrFunction(attribute.value) || !isJustOptionalChaining(attribute.value)) {
          if (!isInterpolationValue(attribute.value) || hasPipeOrNonSafeCall(attribute.value)) {
            attribute.value.visit(this.hostExprMigrator);
          }
        }
      } else {
        if (
          !(
            (isJustOptionalChaining(attribute.value) &&
              hasLogicalOrNullishOperator(attribute.value)) ||
            isConditionalWithOptionalChainCondition(attribute.value) ||
            isNegationOfOptionalChaining(attribute.value) ||
            (isInterpolationValue(attribute.value) && !hasPipeOrNonSafeCall(attribute.value))
          )
        ) {
          attribute.value.visit(this.hostExprMigrator);
        }
      }
      super.visitBoundAttribute(attribute);
    }

    override visitBoundEvent(event: TmplAstBoundEvent) {
      if (
        event.handler &&
        event.handler.visit &&
        !isDirectOptionalCallEventHandler(event.handler)
      ) {
        event.handler.visit(this.hostExprMigrator);
      }
      super.visitBoundEvent(event);
    }
  }

  const visitNode = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const decorators = ts.getDecorators(node) ?? [];
      const ngDecorators = getAngularDecorators(typeChecker, decorators);

      for (const decorator of ngDecorators) {
        if (decorator.name !== 'Component' && decorator.name !== 'Directive') {
          continue;
        }

        const metadata = decorator.node.expression.arguments[0];
        if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
          continue;
        }

        for (const prop of metadata.properties) {
          if (!ts.isPropertyAssignment(prop)) {
            continue;
          }

          const propName = getPropertyNameText(prop.name);
          if (propName !== 'host' || !ts.isObjectLiteralExpression(prop.initializer)) {
            continue;
          }

          for (const hostProp of prop.initializer.properties) {
            if (
              !ts.isPropertyAssignment(hostProp) ||
              !ts.isStringLiteralLike(hostProp.initializer)
            ) {
              continue;
            }

            const hostKey = getPropertyNameText(hostProp.name);
            if (hostKey === null || (!hostKey.startsWith('[') && !hostKey.startsWith('('))) {
              continue;
            }

            // Preserve raw text between quotes/backticks so source offsets stay aligned.
            const hostExpression = hostProp.initializer.getText().slice(1, -1);
            const fakeTemplatePrefix = `<div ${hostKey}="`;
            const fakeTemplate = `${fakeTemplatePrefix}${hostExpression}"></div>`;
            const parsedNodes = parseTemplate(fakeTemplate, sourceFile.fileName, {
              preserveWhitespaces: true,
            }).nodes;

            const hostExpressionStart = hostProp.initializer.getStart() + 1;
            const exprMigrator = new ExpressionMigrator(
              file,
              hostExpressionStart - fakeTemplatePrefix.length,
            );
            const visitor = new HostBindingVisitor(exprMigrator);

            for (const parsedNode of parsedNodes) {
              if (parsedNode.visit) {
                parsedNode.visit(visitor);
              }
            }

            replacements.push(...exprMigrator.replacements);
          }
        }
      }
    }

    ts.forEachChild(node, visitNode);
  };

  visitNode(sourceFile);
  return replacements;
}

class ExpressionMigrator extends RecursiveAstVisitor {
  private handledChains = new Set<AST>();
  replacements: Replacement[] = [];

  constructor(
    private file: ProjectFile,
    private templateStart: number,
  ) {
    super();
  }

  private handleChain(ast: AST) {
    if (this.handledChains.has(ast)) return;
    if (hasSafeNavigationInChain(ast)) {
      this.addReplacement(ast);
      let current: AST = ast;
      while (current) {
        this.handledChains.add(current);
        if (
          current instanceof PropertyRead ||
          current instanceof SafePropertyRead ||
          current instanceof Call ||
          current instanceof SafeCall ||
          current instanceof KeyedRead ||
          current instanceof SafeKeyedRead
        ) {
          current = current.receiver;
        } else if (current instanceof NonNullAssert) {
          current = current.expression;
        } else {
          break;
        }
      }
    }
  }

  override visitPropertyRead(ast: PropertyRead, context: unknown) {
    this.handleChain(ast);
    super.visitPropertyRead(ast, context);
  }
  override visitSafePropertyRead(ast: SafePropertyRead, context: unknown) {
    this.handleChain(ast);
    super.visitSafePropertyRead(ast, context);
  }
  override visitCall(ast: Call, context: unknown) {
    this.handleChain(ast);
    super.visitCall(ast, context);
  }
  override visitSafeCall(ast: SafeCall, context: unknown) {
    this.handleChain(ast);
    super.visitSafeCall(ast, context);
  }
  override visitKeyedRead(ast: KeyedRead, context: unknown) {
    this.handleChain(ast);
    super.visitKeyedRead(ast, context);
  }
  override visitSafeKeyedRead(ast: SafeKeyedRead, context: unknown) {
    this.handleChain(ast);
    super.visitSafeKeyedRead(ast, context);
  }

  private addReplacement(ast: AST) {
    const startArg = ast.sourceSpan.start;
    const endArg = ast.sourceSpan.end;

    this.replacements.push(
      new Replacement(
        this.file,
        new TextUpdate({
          position: this.templateStart + endArg,
          end: this.templateStart + endArg,
          toInsert: ')',
        }),
      ),
      new Replacement(
        this.file,
        new TextUpdate({
          position: this.templateStart + startArg,
          end: this.templateStart + startArg,
          toInsert: '$safeNavigationMigration(',
        }),
      ),
    );
  }
}

function hasSafeNavigationInChain(ast: AST): boolean {
  let current = ast;
  while (current) {
    if (
      current instanceof SafePropertyRead ||
      current instanceof SafeCall ||
      current instanceof SafeKeyedRead
    ) {
      return true;
    }
    if (
      current instanceof PropertyRead ||
      current instanceof Call ||
      current instanceof KeyedRead
    ) {
      current = current.receiver;
    } else if (current instanceof NonNullAssert) {
      current = current.expression;
    } else {
      break;
    }
  }
  return false;
}

function hasPipeOrFunction(ast: AST): boolean {
  let result = false;
  class PipeOrFuncVisitor extends RecursiveAstVisitor {
    override visitPipe(node: BindingPipe, context: unknown) {
      result = true;
      super.visitPipe(node, context);
    }
    override visitCall(node: Call, context: unknown) {
      result = true;
      super.visitCall(node, context);
    }
    override visitSafeCall(node: SafeCall, context: unknown) {
      result = true;
      super.visitSafeCall(node, context);
    }
  }
  const visitor = new PipeOrFuncVisitor();
  ast.visit(visitor);

  return result;
}

function hasPipeOrNonSafeCall(ast: AST): boolean {
  let result = false;
  class PipeOrNonSafeCallVisitor extends RecursiveAstVisitor {
    override visitPipe(node: BindingPipe, context: unknown) {
      result = true;
      super.visitPipe(node, context);
    }
    override visitCall(node: Call, context: unknown) {
      result = true;
      super.visitCall(node, context);
    }
  }
  const visitor = new PipeOrNonSafeCallVisitor();
  ast.visit(visitor);

  return result;
}

function hasNullCheckInAST(ast: AST): boolean {
  let hasNullCheck = false;
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;

  class NullCheckVisitor extends RecursiveAstVisitor {
    override visitBinary(node: Binary, context: unknown) {
      if (node.operation === '===' || node.operation === '!==') {
        const isLeftNullish =
          node.left instanceof LiteralPrimitive &&
          (node.left.value === null || node.left.value === undefined);
        const isRightNullish =
          node.right instanceof LiteralPrimitive &&
          (node.right.value === null || node.right.value === undefined);
        if (isLeftNullish || isRightNullish) {
          hasNullCheck = true;
        }
      }
      super.visitBinary(node, context);
    }
  }
  const visitor = new NullCheckVisitor();
  innerAst.visit(visitor);
  return hasNullCheck;
}

function isNullishLiteralAST(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  return (
    innerAst instanceof LiteralPrimitive &&
    (innerAst.value === null || innerAst.value === undefined)
  );
}

function isJustOptionalChaining(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;

  if (
    innerAst instanceof SafePropertyRead ||
    innerAst instanceof SafeCall ||
    innerAst instanceof SafeKeyedRead ||
    innerAst instanceof PropertyRead ||
    innerAst instanceof Call ||
    innerAst instanceof KeyedRead ||
    innerAst instanceof LiteralPrimitive ||
    innerAst instanceof LiteralArray ||
    innerAst instanceof LiteralMap ||
    innerAst instanceof ImplicitReceiver
  ) {
    return true;
  }

  if (innerAst instanceof PrefixNot) {
    return true;
  }

  if (
    innerAst instanceof Binary &&
    (innerAst.operation === '||' || innerAst.operation === '&&' || innerAst.operation === '??')
  ) {
    return isJustOptionalChaining(innerAst.left) && isJustOptionalChaining(innerAst.right);
  }

  return false;
}

function hasLogicalOrNullishOperator(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  if (!(innerAst instanceof Binary)) {
    return false;
  }

  if (innerAst.operation === '||' || innerAst.operation === '&&' || innerAst.operation === '??') {
    return true;
  }

  return hasLogicalOrNullishOperator(innerAst.left) || hasLogicalOrNullishOperator(innerAst.right);
}

function isConditionalWithOptionalChainCondition(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  if (!(innerAst instanceof Conditional)) {
    return false;
  }

  return isJustOptionalChaining(innerAst.condition) && !hasNullCheckInAST(innerAst.condition);
}

function isNegationOfOptionalChaining(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  if (!(innerAst instanceof PrefixNot)) {
    return false;
  }
  return isJustOptionalChaining(innerAst.expression);
}

function isInterpolationValue(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  return innerAst instanceof Interpolation;
}

function isDirectOptionalCallEventHandler(ast: AST): boolean {
  const innerAst = ast instanceof ASTWithSource ? ast.ast : ast;
  if (innerAst instanceof Chain) {
    const expressions = innerAst.expressions;
    return expressions.length === 1 && hasSafeNavigationInChain(expressions[0]);
  }

  return hasSafeNavigationInChain(innerAst);
}

function isAst(value: unknown): value is AST {
  return !!value && typeof (value as AST).visit === 'function';
}

class TmplVisitor extends TmplAstRecursiveVisitor {
  private migratableSwitchCases = new WeakSet<TmplAstSwitchBlockCase>();
  private ngSwitchContextStack: boolean[] = [];

  constructor(private exprMigrator: ExpressionMigrator) {
    super();
  }

  private hasNgSwitchBinding(node: TmplAstElement | TmplAstTemplate): boolean {
    return (
      node.inputs.some((attr) => attr.name === 'ngSwitch') ||
      (node instanceof TmplAstTemplate &&
        node.templateAttrs.some(
          (attr: TmplAstBoundAttribute | TmplAstTextAttribute) => attr.name === 'ngSwitch',
        ))
    );
  }

  private hasNullCheckInNgSwitchCases(nodes: Array<TmplAstElement | TmplAstTemplate>): boolean {
    for (const node of nodes) {
      for (const input of node.inputs) {
        if (
          input.name === 'ngSwitchCase' &&
          input.value &&
          (hasNullCheckInAST(input.value) || isNullishLiteralAST(input.value))
        ) {
          return true;
        }
      }

      if (node instanceof TmplAstTemplate) {
        for (const attr of node.templateAttrs) {
          if (
            attr instanceof TmplAstBoundAttribute &&
            attr.name === 'ngSwitchCase' &&
            attr.value &&
            (hasNullCheckInAST(attr.value) || isNullishLiteralAST(attr.value))
          ) {
            return true;
          }
        }
      }

      const childHosts = node.children.filter(
        (child): child is TmplAstElement | TmplAstTemplate =>
          child instanceof TmplAstElement || child instanceof TmplAstTemplate,
      );

      if (this.hasNullCheckInNgSwitchCases(childHosts)) {
        return true;
      }
    }

    return false;
  }

  private shouldMigrateCurrentNgSwitchContext(): boolean {
    return this.ngSwitchContextStack[this.ngSwitchContextStack.length - 1] ?? true;
  }

  override visitElement(element: TmplAstElement) {
    const hasNgSwitch = this.hasNgSwitchBinding(element);
    if (hasNgSwitch) {
      const childHosts = element.children.filter(
        (child): child is TmplAstElement | TmplAstTemplate =>
          child instanceof TmplAstElement || child instanceof TmplAstTemplate,
      );
      this.ngSwitchContextStack.push(this.hasNullCheckInNgSwitchCases(childHosts));
    }

    super.visitElement(element);

    if (hasNgSwitch) {
      this.ngSwitchContextStack.pop();
    }
  }

  override visitBoundAttribute(attribute: TmplAstBoundAttribute) {
    if (attribute.name === 'ngIf') {
      if (hasNullCheckInAST(attribute.value)) {
        attribute.value.visit(this.exprMigrator);
      }
    } else if (attribute.name === 'ngSwitch' || attribute.name === 'ngSwitchCase') {
      if (this.shouldMigrateCurrentNgSwitchContext()) {
        attribute.value.visit(this.exprMigrator);
      }
    } else if (attribute.name === 'ngForOf') {
      // skip
    } else if (
      attribute.type === BindingType.Class ||
      attribute.type === BindingType.Style ||
      attribute.type === BindingType.Attribute ||
      (attribute.type === BindingType.Property &&
        (attribute.name === 'class' ||
          attribute.name === 'className' ||
          attribute.name === 'style'))
    ) {
      if (hasPipeOrFunction(attribute.value) || !isJustOptionalChaining(attribute.value)) {
        if (!isInterpolationValue(attribute.value) || hasPipeOrNonSafeCall(attribute.value)) {
          attribute.value.visit(this.exprMigrator);
        }
      }
    } else {
      if (
        !(
          (isJustOptionalChaining(attribute.value) &&
            hasLogicalOrNullishOperator(attribute.value)) ||
          isConditionalWithOptionalChainCondition(attribute.value) ||
          isNegationOfOptionalChaining(attribute.value) ||
          (isInterpolationValue(attribute.value) && !hasPipeOrNonSafeCall(attribute.value))
        )
      ) {
        attribute.value.visit(this.exprMigrator);
      }
    }
    super.visitBoundAttribute(attribute);
  }

  override visitBoundEvent(event: TmplAstBoundEvent) {
    if (event.handler && event.handler.visit && !isDirectOptionalCallEventHandler(event.handler)) {
      event.handler.visit(this.exprMigrator);
    }
    super.visitBoundEvent(event);
  }

  override visitBoundText(text: TmplAstBoundText) {
    if (hasPipeOrNonSafeCall(text.value) || hasNullCheckInAST(text.value)) {
      text.value.visit(this.exprMigrator);
    }
    super.visitBoundText(text);
  }

  override visitTemplate(template: TmplAstTemplate) {
    const hasNgSwitch = this.hasNgSwitchBinding(template);
    if (hasNgSwitch) {
      const childHosts = template.children.filter(
        (child): child is TmplAstElement | TmplAstTemplate =>
          child instanceof TmplAstElement || child instanceof TmplAstTemplate,
      );
      this.ngSwitchContextStack.push(this.hasNullCheckInNgSwitchCases(childHosts));
    }

    for (const attr of template.templateAttrs) {
      if (!(attr instanceof TmplAstBoundAttribute)) {
        continue;
      }

      if (attr.name === 'ngIf') {
        if (isAst(attr.value) && hasNullCheckInAST(attr.value)) {
          attr.value.visit(this.exprMigrator);
        }
      } else if (attr.name === 'ngSwitch' || attr.name === 'ngSwitchCase') {
        if (this.shouldMigrateCurrentNgSwitchContext() && isAst(attr.value)) {
          attr.value.visit(this.exprMigrator);
        }
      } else if (attr.name === 'ngForOf') {
        // skip
      } else {
        if (isAst(attr.value)) {
          attr.value.visit(this.exprMigrator);
        }
      }
    }

    super.visitTemplate(template);

    if (hasNgSwitch) {
      this.ngSwitchContextStack.pop();
    }
  }

  override visitIfBlockBranch(block: TmplAstIfBlockBranch) {
    if (block.expression) {
      if (hasNullCheckInAST(block.expression)) {
        block.expression.visit(this.exprMigrator);
      }
    }
    super.visitIfBlockBranch(block);
  }

  override visitForLoopBlock(block: TmplAstForLoopBlock) {
    // Don't visit block.expression or trackBy with exprMigrator, but visit its children.
    super.visitForLoopBlock(block);
  }

  override visitLetDeclaration(decl: TmplAstLetDeclaration) {
    if (isAst(decl.value)) {
      decl.value.visit(this.exprMigrator);
    }
    super.visitLetDeclaration(decl);
  }

  override visitSwitchBlock(block: TmplAstSwitchBlock) {
    const switchCases = block.groups.flatMap((group: TmplAstSwitchBlockCaseGroup) => group.cases);

    const shouldMigrate = switchCases.some(
      (switchCase: TmplAstSwitchBlockCase) =>
        switchCase.expression &&
        (hasNullCheckInAST(switchCase.expression) || isNullishLiteralAST(switchCase.expression)),
    );

    if (shouldMigrate && block.expression) {
      block.expression.visit(this.exprMigrator);
    }

    if (shouldMigrate) {
      for (const switchCase of switchCases) {
        this.migratableSwitchCases.add(switchCase);
      }
    }

    super.visitSwitchBlock(block);
  }

  override visitSwitchBlockCase(block: TmplAstSwitchBlockCase) {
    if (this.migratableSwitchCases.has(block) && block.expression) {
      block.expression.visit(this.exprMigrator);
    }
    super.visitSwitchBlockCase(block);
  }

  override visitDeferredTrigger(trigger: TmplAstDeferredTrigger) {
    if (trigger instanceof TmplAstBoundDeferredTrigger && hasNullCheckInAST(trigger.value)) {
      trigger.value.visit(this.exprMigrator);
    }
    super.visitDeferredTrigger(trigger);
  }
}
