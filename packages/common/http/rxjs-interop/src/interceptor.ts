/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  EnvironmentInjector,
  inject,
  Injectable,
  InjectionToken,
  runInInjectionContext,
  ɵPendingTasksInternal as PendingTasks,
  PLATFORM_ID,
  ɵformatRuntimeError as formatRuntimeError,
  ɵConsole as Console,
} from '@angular/core';
import {isPlatformServer} from '@angular/common';
import {finalize} from 'rxjs/operators';

import {HttpBackend, HttpHandler} from './backend';
import {
  HttpRequest,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HTTP_INTERCEPTOR_FNS,
  HttpResponse,
  ɵRuntimeErrorCode as RuntimeErrorCode,
  ɵREQUESTS_CONTRIBUTE_TO_STABILITY as REQUESTS_CONTRIBUTE_TO_STABILITY,
  ɵHTTP_ROOT_INTERCEPTOR_FNS as HTTP_ROOT_INTERCEPTOR_FNS,
} from '@angular/common/http';
import {Observable} from 'rxjs';
import {FetchBackend} from './fetch';

/**
 * Intercepts and handles an `HttpRequest` or `HttpResponse`.
 *
 * Most interceptors transform the outgoing request before passing it to the
 * next interceptor in the chain, by calling `next.handle(transformedReq)`.
 * An interceptor may transform the
 * response event stream as well, by applying additional RxJS operators on the stream
 * returned by `next.handle()`.
 *
 * More rarely, an interceptor may handle the request entirely,
 * and compose a new event stream instead of invoking `next.handle()`. This is an
 * acceptable behavior, but keep in mind that further interceptors will be skipped entirely.
 *
 * It is also rare but valid for an interceptor to return multiple responses on the
 * event stream for a single request.
 *
 * @publicApi
 *
 * @see [HTTP Guide](guide/http/interceptors)
 * @see {@link HttpInterceptorFn}
 *
 * @usageNotes
 *
 * To use the same instance of `HttpInterceptors` for the entire app, import the `HttpClientModule`
 * only in your `AppModule`, and add the interceptors to the root application injector.
 * If you import `HttpClientModule` multiple times across different modules (for example, in lazy
 * loading modules), each import creates a new copy of the `HttpClientModule`, which overwrites the
 * interceptors provided in the root module.
 */
export interface HttpInterceptor {
  /**
   * Identifies and handles a given HTTP request.
   * @param req The outgoing request object to handle.
   * @param next The next interceptor in the chain, or the backend
   * if no interceptors remain in the chain.
   * @returns An observable of the event stream.
   */
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>>;
}

/**
 * Function which invokes an HTTP interceptor chain.
 *
 * Each interceptor in the interceptor chain is turned into a `ChainedInterceptorFn` which closes
 * over the rest of the chain (represented by another `ChainedInterceptorFn`). The last such
 * function in the chain will instead delegate to the `finalHandlerFn`, which is passed down when
 * the chain is invoked.
 *
 * This pattern allows for a chain of many interceptors to be composed and wrapped in a single
 * `HttpInterceptorFn`, which is a useful abstraction for including different kinds of interceptors
 * (e.g. legacy class-based interceptors) in the same chain.
 */
type ChainedInterceptorFn<RequestT> = (
  req: HttpRequest<RequestT>,
  finalHandlerFn: HttpHandlerFn,
) => Observable<HttpEvent<RequestT>>;

function interceptorChainEndFn(
  req: HttpRequest<any>,
  finalHandlerFn: HttpHandlerFn,
): Observable<HttpEvent<any>> {
  return finalHandlerFn(req) as Observable<HttpEvent<any>>;
}

/**
 * Constructs a `ChainedInterceptorFn` which adapts a legacy `HttpInterceptor` to the
 * `ChainedInterceptorFn` interface.
 */
function adaptLegacyInterceptorToChain(
  chainTailFn: ChainedInterceptorFn<any>,
  interceptor: HttpInterceptor,
): ChainedInterceptorFn<any> {
  return (initialRequest: HttpRequest<any>, finalHandlerFn: HttpHandlerFn) =>
    interceptor.intercept(initialRequest, {
      handle: (downstreamRequest) => chainTailFn(downstreamRequest, finalHandlerFn),
    });
}

/**
 * Constructs a `ChainedInterceptorFn` which wraps and invokes a functional interceptor in the given
 * injector.
 */
function chainedInterceptorFn(
  chainTailFn: ChainedInterceptorFn<unknown>,
  interceptorFn: HttpInterceptorFn,
  injector: EnvironmentInjector,
): ChainedInterceptorFn<unknown> {
  if ('eventInterceptor' in interceptorFn) {
    return (initialRequest, finalHandlerFn) => {
      return new Observable<HttpEvent<unknown>>((subscriber) => {
        return runInInjectionContext(injector, () => {
          interceptorFn.eventInterceptor(
            initialRequest,
            (downstreamRequest) => chainTailFn(downstreamRequest, finalHandlerFn),
            (event) => {
              subscriber.next(event);
              if (event instanceof HttpResponse) {
                subscriber.complete();
              }
            },
          );
        });
      });
    };
  }

  return (initialRequest, finalHandlerFn) => {
    return runInInjectionContext(injector, () => {
      return interceptorFn(initialRequest, (downstreamRequest) =>
        chainTailFn(downstreamRequest, finalHandlerFn),
      ) as Observable<HttpEvent<unknown>>;
    });
  };
}

/**
 * A multi-provider token that represents the array of registered
 * `HttpInterceptor` objects.
 *
 * @publicApi
 */
export const HTTP_INTERCEPTORS = new InjectionToken<readonly HttpInterceptor[]>(
  ngDevMode ? 'HTTP_INTERCEPTORS' : '',
);




/**
 * Creates an `HttpInterceptorFn` which lazily initializes an interceptor chain from the legacy
 * class-based interceptors and runs the request through it.
 */
export function legacyInterceptorFnFactory(): HttpInterceptorFn {
  let chain: ChainedInterceptorFn<any> | null = null;

  return (req: HttpRequest<unknown>, handler: HttpHandlerFn) => {
    if (chain === null) {
      const interceptors = inject(HTTP_INTERCEPTORS, {optional: true}) ?? [];
      // Note: interceptors are wrapped right-to-left so that final execution order is
      // left-to-right. That is, if `interceptors` is the array `[a, b, c]`, we want to
      // produce a chain that is conceptually `c(b(a(end)))`, which we build from the inside
      // out.
      chain = interceptors.reduceRight(
        adaptLegacyInterceptorToChain,
        interceptorChainEndFn as ChainedInterceptorFn<any>,
      );
    }

    const pendingTasks = inject(PendingTasks);
    const contributeToStability = inject(REQUESTS_CONTRIBUTE_TO_STABILITY);
    if (contributeToStability) {
      const taskId = pendingTasks.add();
      return chain(req, handler).pipe(finalize(() => pendingTasks.remove(taskId)));
    } else {
      return chain(req, handler);
    }
  };
}

let fetchBackendWarningDisplayed = false;

/** Internal function to reset the flag in tests */
export function resetFetchBackendWarningFlag() {
  fetchBackendWarningDisplayed = false;
}

@Injectable()
export class HttpInterceptorHandler implements HttpHandler {
  private chain: ChainedInterceptorFn<unknown> | null = null;
  private readonly pendingTasks = inject(PendingTasks);
  private readonly contributeToStability = inject(REQUESTS_CONTRIBUTE_TO_STABILITY);

  constructor(
    private backend: HttpBackend,
    private injector: EnvironmentInjector,
  ) {
    // We strongly recommend using fetch backend for HTTP calls when SSR is used
    // for an application. The logic below checks if that's the case and produces
    // a warning otherwise.
    if ((typeof ngDevMode === 'undefined' || ngDevMode) && !fetchBackendWarningDisplayed) {
      const isServer = isPlatformServer(injector.get(PLATFORM_ID));
      // This flag is necessary because provideHttpClientTesting() overrides the backend
      // even if `withFetch()` is used within the test. When the testing HTTP backend is provided,
      // no HTTP calls are actually performed during the test, so producing a warning would be
      // misleading.
      const isTestingBackend = (this.backend as any).isTestingBackend;
      if (isServer && !(this.backend instanceof FetchBackend) && !isTestingBackend) {
        fetchBackendWarningDisplayed = true;
        injector
          .get(Console)
          .warn(
            formatRuntimeError(
              RuntimeErrorCode.NOT_USING_FETCH_BACKEND_IN_SSR,
              'Angular detected that `HttpClient` is not configured ' +
                "to use `fetch` APIs. It's strongly recommended to " +
                'enable `fetch` for applications that use Server-Side Rendering ' +
                'for better performance and compatibility. ' +
                'To enable `fetch`, add the `withFetch()` to the `provideHttpClient()` ' +
                'call at the root of the application.',
            ),
          );
      }
    }
  }

  handle(initialRequest: HttpRequest<any>): Observable<HttpEvent<any>> {
    if (this.chain === null) {
      const dedupedInterceptorFns: HttpInterceptorFn[] = Array.from(
        new Set([
          ...this.injector.get(HTTP_INTERCEPTOR_FNS),
          ...this.injector.get(HTTP_ROOT_INTERCEPTOR_FNS, []),
        ]),
      );

      // Note: interceptors are wrapped right-to-left so that final execution order is
      // left-to-right. That is, if `dedupedInterceptorFns` is the array `[a, b, c]`, we want to
      // produce a chain that is conceptually `c(b(a(end)))`, which we build from the inside
      // out.
      this.chain = dedupedInterceptorFns.reduceRight(
        (nextSequencedFn: ChainedInterceptorFn<unknown>, interceptorFn) => {
          return chainedInterceptorFn(nextSequencedFn, interceptorFn, this.injector);
        },
        interceptorChainEndFn as ChainedInterceptorFn<unknown>,
      );
    }

    if (this.contributeToStability) {
      const taskId = this.pendingTasks.add();
      return this.chain(initialRequest, (downstreamRequest) =>
        this.backend.handle(downstreamRequest),
      ).pipe(finalize(() => this.pendingTasks.remove(taskId)));
    } else {
      return this.chain(initialRequest, (downstreamRequest) =>
        this.backend.handle(downstreamRequest),
      );
    }
  }
}
