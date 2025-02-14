/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * @module
 * @description
 * Entry point for all public APIs of this package.
 */
export * from './src/http-interop';

export {
  HTTP_INTERCEPTORS,
  HttpInterceptor,
  HttpInterceptorHandler as ɵHttpInterceptorHandler,
  HttpInterceptorHandler as ɵHttpInterceptingHandler,
} from './src/interceptor';
export {JsonpClientBackend, JsonpInterceptor} from './src/jsonp';
export {
  HttpTransferCacheOptions,
  withHttpTransferCache as ɵwithHttpTransferCache,
  HTTP_TRANSFER_CACHE_ORIGIN_MAP,
} from './src/transfer_cache';
export {HttpXsrfTokenExtractor} from './src/xsrf';
export {HttpBackend, HttpHandler} from './src/backend';
export {HttpXhrBackend} from './src/xhr';
export {HttpClientModule} from './src/module';
export {HttpClient} from './src/client';
export {FetchBackend} from './src/fetch';

// Private exports
export * from './src/private_export';
