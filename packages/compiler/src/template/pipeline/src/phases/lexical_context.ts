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
 * Find any access to `globalThis` and replace them with `globalThis` to allow global scope access
 */
export function accessModuleScope(job: CompilationJob): void {
  if (job instanceof ComponentCompilationJob) {
    for (const unit of job.units) {
      for (const op of unit.ops()) {
        ir.transformExpressionsInOp(
          op,
          (expr) => replaceGlobalThis(expr, job.symbols),
          ir.VisitorContextFlag.None,
        );
      }
    }
  }
}

function replaceGlobalThis(expr: o.Expression, symbols: string[]): o.Expression {
  if (expr instanceof ir.LexicalReadExpr) {
    if (symbols.includes(expr.name)) {
      return new o.ReadVarExpr(expr.name);
    }
  }
  return expr;
}
