/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {EnvironmentInjector, inject, Injectable, InjectionToken} from '@angular/core';
import {HttpBackend2, HttpHandler2, ObservableLike} from './backend';
import {HttpRequest} from './request';
import {HttpEvent, HttpResponse} from './response';

/**
 * Represents the next interceptor in an interceptor chain, or the real backend if there are no
 * further interceptors.
 *
 * Most interceptors will delegate to this function, and either modify the outgoing request or the
 * response when it arrives. Within the scope of the current request, however, this function may be
 * called any number of times, for any number of downstream requests. Such downstream requests need
 * not be to the same URL or even the same origin as the current request. It is also valid to not
 * call the downstream handler at all, and process the current request entirely within the
 * interceptor.
 *
 * This function should only be called within the scope of the request that's currently being
 * intercepted. Once that request is complete, this downstream handler function should not be
 * called.
 *
 * @publicApi
 *
 * @see [HTTP Guide](guide/http/interceptors)
 */
export type HttpHandlerFn = (req: HttpRequest<unknown>) => ObservableLike<HttpEvent<unknown>>;

/**
 * An interceptor for HTTP requests made via `HttpClient`.
 *
 * `HttpInterceptorFn`s are middleware functions which `HttpClient` calls when a request is made.
 * These functions have the opportunity to modify the outgoing request or any response that comes
 * back, as well as block, redirect, or otherwise change the request or response semantics.
 *
 * An `HttpHandlerFn` representing the next interceptor (or the backend which will make a real HTTP
 * request) is provided. Most interceptors will delegate to this function, but that is not required
 * (see `HttpHandlerFn` for more details).
 *
 * `HttpInterceptorFn`s are executed in an [injection context](guide/di/dependency-injection-context).
 * They have access to `inject()` via the `EnvironmentInjector` from which they were configured.
 *
 * @see [HTTP Guide](guide/http/interceptors)
 * @see {@link withInterceptors}
 *
 * @usageNotes
 * Here is a noop interceptor that passes the request through without modifying it:
 * ```ts
 * export const noopInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next:
 * HttpHandlerFn) => {
 *   return next(modifiedReq);
 * };
 * ```
 *
 * If you want to alter a request, clone it first and modify the clone before passing it to the
 * `next()` handler function.
 *
 * Here is a basic interceptor that adds a bearer token to the headers
 * ```ts
 * export const authenticationInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next:
 * HttpHandlerFn) => {
 *    const userToken = 'MY_TOKEN'; const modifiedReq = req.clone({
 *      headers: req.headers.set('Authorization', `Bearer ${userToken}`),
 *    });
 *
 *    return next(modifiedReq);
 * };
 * ```
 */
export type HttpInterceptorFn =
  | ObservableInterceptorFn
  | {
      eventInterceptor: (
        request: HttpRequest<unknown>,
        next: HttpHandlerFn,
        onEvent: (event: HttpEvent<any>) => void,
      ) => void;
    };

export type ObservableInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => ObservableLike<HttpEvent<unknown>>;

/**
 * A multi-provided token of `HttpInterceptorFn`s.
 */
export const HTTP_INTERCEPTOR_FNS = new InjectionToken<readonly HttpInterceptorFn[]>(
  ngDevMode ? 'HTTP_INTERCEPTOR_FNS' : '',
);

/**
 * A multi-provided token of `HttpInterceptorFn`s that are only set in root.
 */
export const HTTP_ROOT_INTERCEPTOR_FNS = new InjectionToken<readonly HttpInterceptorFn[]>(
  ngDevMode ? 'HTTP_ROOT_INTERCEPTOR_FNS' : '',
);

// TODO(atscott): We need a larger discussion about stability and what should contribute to stability.
// Should the whole interceptor chain contribute to stability or just the backend request #55075?
// Should HttpClient contribute to stability automatically at all?
export const REQUESTS_CONTRIBUTE_TO_STABILITY = new InjectionToken<boolean>(
  ngDevMode ? 'REQUESTS_CONTRIBUTE_TO_STABILITY' : '',
  {providedIn: 'root', factory: () => true},
);

@Injectable()
export class HttpInterceptorHandler implements HttpHandler2 {
  private injector = inject(EnvironmentInjector);
  private backend = inject(HttpBackend2);

  async handle(request: HttpRequest<any>, onEvent: (event: HttpEvent<any>) => void): Promise<void> {
    const dedupedInterceptorFns: HttpInterceptorFn[] = Array.from(
      new Set([
        ...this.injector.get(HTTP_INTERCEPTOR_FNS),
        ...this.injector.get(HTTP_ROOT_INTERCEPTOR_FNS, []),
      ]),
    );

    let index = -1;

    const next = async (req: HttpRequest<any>, onEvent: (event: HttpEvent<any>) => void): Promise<void> => {
      index++;
      if (index < dedupedInterceptorFns.length) {
        const interceptor = dedupedInterceptorFns[index];
        if (!('eventInterceptor' in interceptor)) {
          // Handle interceptors with next function
          const response = await interceptor(req, next);
          onEvent(response);
        } else {
          // Handle interceptors without next function
          return interceptor.eventInterceptor(req, next, onEvent);
        }
      } else {
        return this.backend.handle(req, onEvent);
      }
    };

    await next(request, (event) => onEvent(event));
  }
}
