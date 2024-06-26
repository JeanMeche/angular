/****************************************************************************************************
 * PARTIAL FILE: basic_optimized_image.js
 ****************************************************************************************************/
import { Component } from '@angular/core';
import * as i0 from "@angular/core";
export class MyApp {
    constructor() {
        this.message = 'hello';
    }
}
MyApp.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: MyApp, deps: [], target: i0.ɵɵFactoryTarget.Component });
MyApp.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "0.0.0-PLACEHOLDER", type: MyApp, selector: "ng-component", ngImport: i0, template: `<img ngSrc="path/to/my/file.jpg"/>`, isInline: true });
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "0.0.0-PLACEHOLDER", ngImport: i0, type: MyApp, decorators: [{
            type: Component,
            args: [{
                    template: `<img ngSrc="path/to/my/file.jpg"/>`
                }]
        }] });

/****************************************************************************************************
 * PARTIAL FILE: basic_optimized_image.d.ts
 ****************************************************************************************************/
import * as i0 from "@angular/core";
export declare class MyApp {
    message: string;
    static ɵfac: i0.ɵɵFactoryDeclaration<MyApp, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<MyApp, "ng-component", never, {}, {}, never, never, false, never>;
}

