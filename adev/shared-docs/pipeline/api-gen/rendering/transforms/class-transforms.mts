/*!
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {ClassEntry} from '../../entities/entities.mjs';
import {ClassEntryRenderable} from '../entities/renderables.mjs';
import {addRenderableCodeToc} from './code-transforms.mjs';
import {
  addHtmlAdditionalLinks,
  addHtmlDescription,
  addHtmlJsDocTagComments,
  addHtmlUsageNotes,
  setEntryFlags,
} from './jsdoc-transforms.mjs';
import {addRenderableMembers} from './member-transforms.mjs';
import {addModuleName} from './module-name.mjs';
import {addRepo} from './repo.mjs';

import {applyTransforms} from './transformation-pipeline.mjs';

/** Given an unprocessed class entry, get the fully renderable class entry. */
export async function getClassRenderable(
  classEntry: ClassEntry,
  moduleName: string,
  repo: string,
): Promise<ClassEntryRenderable> {
  return applyTransforms(classEntry, [
    (entry) => addModuleName(entry, moduleName),
    (entry) => addRepo(entry, repo),
    addHtmlDescription,
    addHtmlJsDocTagComments,
    addHtmlUsageNotes,
    addHtmlAdditionalLinks,
    (entry) => addRenderableMembers(entry, classEntry.name),
    addRenderableCodeToc,
    setEntryFlags,
  ]);
}
