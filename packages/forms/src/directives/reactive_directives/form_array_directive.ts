/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Directive, EventEmitter, forwardRef, Input, Output, Provider} from '@angular/core';

import {FormArray} from '../../model/form_array';
import {ControlContainer} from '../control_container';

import {AbstractFormDirective} from './abstract_form.directive';

const formDirectiveProvider: Provider = {
  provide: ControlContainer,
  useExisting: forwardRef(() => FormArrayDirective),
};

/**
 * @description
 *
 * Binds an existing `FormArray` to a DOM element.
 *
 * This directive accepts an existing `FormArray` instance. It will then use this
 * `FormArray` instance to match any child `FormControl`, `FormGroup`/`FormRecord`,
 * and `FormArray` instances to child `FormControlName`, `FormGroupName`,
 * and `FormArrayName` directives.
 *
 * @see [Reactive Forms Guide](guide/reactive-forms)
 * @see {@link AbstractControl}
 *
 * @usageNotes
 * ### Register Form Group
 *
 * The following example registers a `FormArray` with first name and last name controls,
 * and listens for the *ngSubmit* event when the button is clicked.
 *
 * {@example forms/ts/simpleFormGroup/simple_form_group_example.ts region='Component'}
 *
 * @ngModule ReactiveFormsModule
 * @publicApi
 */
@Directive({
  selector: '[formArray]',
  providers: [formDirectiveProvider],
  host: {'(submit)': 'onSubmit($event)', '(reset)': 'onReset()'},
  exportAs: 'ngForm',
})
export class FormArrayDirective extends AbstractFormDirective<FormArray> {
  /**
   * @description
   * Tracks the `FormArray` bound to this directive.
   */
  @Input('formArray') override form: FormArray = null!;

  /**
   * @description
   * Emits an event when the form submission has been triggered.
   */
  @Output() override ngSubmit = new EventEmitter();
}
