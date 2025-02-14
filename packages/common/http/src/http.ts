import {inject, Injectable} from '@angular/core';
import {HttpRequest} from './request';
import {HttpHeaders} from './headers';
import {HttpContext} from './context';
import {HttpParams, HttpParamsOptions} from './params';
import {HttpBackend2} from './backend';

/**
 *
 * @publicApi
 */
@Injectable({providedIn: 'root'})
export class Http {
  private backend = inject(HttpBackend2);
  //handler = inject(HttpHandler);

  request(
    first: string | HttpRequest<any>,
    url?: string,
    options: {
      body?: any;
      headers?: HttpHeaders | {[header: string]: string | string[]};
      context?: HttpContext;
      observe?: 'body' | 'events' | 'response';
      params?:
        | HttpParams
        | {
            [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>;
          };
      responseType?: 'arraybuffer' | 'blob' | 'json' | 'text';
      withCredentials?: boolean;
      transferCache?: {includeHeaders?: string[]} | boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<any> {
    let req: HttpRequest<any>;
    // First, check whether the primary argument is an instance of `HttpRequest`.
    if (first instanceof HttpRequest) {
      // It is. The other arguments must be undefined (per the signatures) and can be
      // ignored.
      req = first;
    } else {
      // It's a string, so it represents a URL. Construct a request based on it,
      // and incorporate the remaining arguments (assuming `GET` unless a method is
      // provided.

      // Figure out the headers.
      let headers: HttpHeaders | undefined = undefined;
      if (options.headers instanceof HttpHeaders) {
        headers = options.headers;
      } else {
        headers = new HttpHeaders(options.headers);
      }

      // Sort out parameters.
      let params: HttpParams | undefined = undefined;
      if (!!options.params) {
        if (options.params instanceof HttpParams) {
          params = options.params;
        } else {
          params = new HttpParams({
            fromObject: options.params,
          } as HttpParamsOptions);
        }
      }

      // Construct the request.
      req = new HttpRequest(first, url!, options.body !== undefined ? options.body : null, {
        headers,
        context: options.context,
        params,
        // By default, JSON is assumed to be returned for all calls.
        responseType: options.responseType || 'json',
        withCredentials: options.withCredentials,
        transferCache: options.transferCache,
      });
    }

    return new Promise((resolve) => {
      this.backend.handle(req, (event) => {
        resolve(event);
      });
    });
  }
}
