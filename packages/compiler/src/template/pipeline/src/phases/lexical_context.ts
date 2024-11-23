/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
import {CompilationJob, ComponentCompilationJob} from '../compilation';

/**
 * TODO
 */
export function accessModuleScope(job: CompilationJob): void {
  if (job instanceof ComponentCompilationJob) {
    for (const unit of job.units) {
      for (const op of unit.ops()) {
        ir.transformExpressionsInOp(
          op,
          (expr) => replaceAccess(expr, job),
          ir.VisitorContextFlag.None,
        );
      }
    }
  }
}

function replaceAccess(expr: o.Expression, job: ComponentCompilationJob): o.Expression {
  if (expr instanceof ir.LexicalReadExpr) {
    const decl = job.inFileDeclarations.find((decl) => decl.name === expr.name);
    if (decl) {
      if (decl.type === 'var') {
        return new o.ReadVarExpr(expr.name);
      } else {
        const exprName = `local_${expr.name}`;
        job.usedDeclarations.push({name: expr.name, moduleName: decl.module});
        return new o.ReadVarExpr(exprName);
      }
    }
  }
  return expr;
}
