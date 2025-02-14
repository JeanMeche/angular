/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  HttpErrorResponse,
  HttpEvent,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {inject, Injectable, NgZone} from '@angular/core';
import {
  ACCEPT_HEADER,
  ACCEPT_HEADER_VALUE,
  CONTENT_TYPE_HEADER,
  X_REQUEST_URL_HEADER,
} from './request';
import {HTTP_STATUS_CODE_OK} from './response';

export type ObservableLike<T> = {
  subscribe: (next: (value: T) => void) => void;
  pipe: Function;
  toPromise: Function;
};

export interface HttpHandler2 {
  handle(request: HttpRequest<any>, onEvent: (event: HttpEvent<any>) => void): Promise<void>;
}

const XSSI_PREFIX = /^\)\]\}',?\n/;

/**
 * Determine an appropriate URL for the response, by checking either
 * response url or the X-Request-URL header.
 */
function getResponseUrl(response: Response): string | null {
  if (response.url) {
    return response.url;
  }
  // stored as lowercase in the map
  const xRequestUrl = X_REQUEST_URL_HEADER.toLocaleLowerCase();
  return response.headers.get(xRequestUrl);
}

/**
 * Uses `fetch` to send requests to a backend server.
 *
 * @see {@link PromiseHttpHandler}
 *
 * @publicApi
 */
@Injectable()
export class PromiseFetchBackend implements HttpBackend2 {
  // We use an arrow function to always reference the current global implementation of `fetch`.
  // This is helpful for cases when the global `fetch` implementation is modified by external code,
  // see https://github.com/angular/angular/issues/57527.
  private readonly fetchImpl =
    inject(FetchFactory, {optional: true})?.fetch ?? ((...args) => globalThis.fetch(...args));
  private readonly ngZone = inject(NgZone);

  async handle(request: HttpRequest<any>, onEvent: (event: HttpEvent<any>) => void, signal?: AbortSignal): Promise<void> {
    const response = await this.doRequest(request, signal);
    onEvent(response);
  }

  private async doRequest(
    request: HttpRequest<any>,
    signal?: AbortSignal,
  ): Promise<HttpResponse<unknown>> {
    const init = this.createRequestInit(request);
    let response;

    try {
      // Run fetch outside of Angular zone.
      // This is due to Node.js fetch implementation (Undici) which uses a number of setTimeouts to check if
      // the response should eventually timeout which causes extra CD cycles every 500ms
      const fetchPromise = this.ngZone.runOutsideAngular(() =>
        this.fetchImpl(request.urlWithParams, {signal, ...init}),
      );

      // Make sure Zone.js doesn't trigger false-positive unhandled promise
      // error in case the Promise is rejected synchronously. See function
      // description for additional information.
      silenceSuperfluousUnhandledPromiseRejection(fetchPromise);

      response = await fetchPromise;
    } catch (error: any) {
      throw new HttpErrorResponse({
        error,
        status: error.status ?? 0,
        statusText: error.statusText,
        url: request.urlWithParams,
        headers: error.headers,
      });
    }

    const headers = new HttpHeaders(response.headers);
    const statusText = response.statusText;
    const url = getResponseUrl(response) ?? request.urlWithParams;

    let status = response.status;
    let body: string | ArrayBuffer | Blob | object | null = null;

    // This backend doesn't do any progress report.
    // Use the Observable based backend instead.

    if (response.body) {
      try {
        const contentType = response.headers.get(CONTENT_TYPE_HEADER) ?? '';
        const responseArrayBuffer = await response.arrayBuffer(); // Get the response body as an ArrayBuffer
        const responseBody = new Uint8Array(responseArrayBuffer);

        body = this.parseBody(request, responseBody, contentType);
      } catch (error) {
        // Body loading or parsing failed
        throw new HttpErrorResponse({
          error,
          headers: new HttpHeaders(response.headers),
          status: response.status,
          statusText: response.statusText,
          url: getResponseUrl(response) ?? request.urlWithParams,
        });
      }
    }

    // Same behavior as the XhrBackend
    if (status === 0) {
      status = body ? HTTP_STATUS_CODE_OK : 0;
    }

    // ok determines whether the response will be transmitted on the event or
    // error channel. Unsuccessful status codes (not 2xx) will always be errors,
    // but a successful status code can still result in an error if the user
    // asked for JSON data and the body cannot be parsed as such.
    const ok = status >= 200 && status < 300;

    if (ok) {
      return new HttpResponse({
        body,
        headers,
        status,
        statusText,
        url,
      });
    } else {
      throw new HttpErrorResponse({
        error: body,
        headers,
        status,
        statusText,
        url,
      });
    }
  }

  private parseBody(
    request: HttpRequest<any>,
    binContent: Uint8Array,
    contentType: string,
  ): string | ArrayBuffer | Blob | object | null {
    switch (request.responseType) {
      case 'json':
        // stripping the XSSI when present
        const text = new TextDecoder().decode(binContent).replace(XSSI_PREFIX, '');
        return text === '' ? null : (JSON.parse(text) as object);
      case 'text':
        return new TextDecoder().decode(binContent);
      case 'blob':
        return new Blob([binContent], {type: contentType});
      case 'arraybuffer':
        return binContent.buffer;
    }
  }

  private createRequestInit(req: HttpRequest<any>): RequestInit {
    // We could share some of this logic with the XhrBackend

    const headers: Record<string, string> = {};
    const credentials: RequestCredentials | undefined = req.withCredentials ? 'include' : undefined;

    // Setting all the requested headers.
    (req.headers as any).forEach(
      (name: string, values: string[]) => (headers[name] = values.join(',')),
    );

    // Add an Accept header if one isn't present already.
    if (!req.headers.has(ACCEPT_HEADER)) {
      headers[ACCEPT_HEADER] = ACCEPT_HEADER_VALUE;
    }

    // Auto-detect the Content-Type header if one isn't present already.
    if (!req.headers.has(CONTENT_TYPE_HEADER)) {
      const detectedType = req.detectContentTypeHeader();
      // Sometimes Content-Type detection fails.
      if (detectedType !== null) {
        headers[CONTENT_TYPE_HEADER] = detectedType;
      }
    }

    return {
      body: req.serializeBody(),
      method: req.method,
      headers,
      credentials,
    };
  }
}

/**
 * Abstract class to provide a mocked implementation of `fetch()`
 */
export abstract class FetchFactory {
  abstract fetch: typeof fetch;
}

function noop(): void {}

/**
 * Zone.js treats a rejected promise that has not yet been awaited
 * as an unhandled error. This function adds a noop `.then` to make
 * sure that Zone.js doesn't throw an error if the Promise is rejected
 * synchronously.
 */
function silenceSuperfluousUnhandledPromiseRejection(promise: Promise<unknown>) {
  promise.then(noop, noop);
}

@Injectable({providedIn: 'root', useExisting: PromiseFetchBackend})
export abstract class HttpBackend2 implements HttpHandler2 {
  abstract handle(request: HttpRequest<any>, onEvent: (event: HttpEvent<any>) => void, signal?: AbortSignal): Promise<void>;
}
