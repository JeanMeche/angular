/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {Injectable, inject, signal, computed, Signal} from '@angular/core';
import {HttpClient} from './client';
import {HttpEvent, HttpEventType, HttpProgressEvent, HttpResponse} from './response';
import {HttpHeaders} from './headers';
import {HttpErrorResponse} from './response';

export type HttpStatus = 'idle' | 'loading' | 'resolved' | 'error';

export interface HttpFetchResult<T> {
  status: Signal<HttpStatus>;
  value: Signal<T | undefined>;
  error: Signal<unknown | undefined>;
  isLoading: Signal<boolean>;
  headers: Signal<HttpHeaders | undefined>;
  statusCode: Signal<number | undefined>;
  progress: Signal<HttpProgressEvent | undefined>;
  result: Promise<T>;
}

/**
 * An imperative Http service that uses Promises and Signals.
 *
 * It is a replacement for `HttpClient` that exposes reactive status and value signals
 * along with a Promise for the response, completely omitting Observables.
 */
@Injectable({providedIn: 'root'})
export class Http {
  private client = inject(HttpClient);

  get<T>(url: string, options?: any): HttpFetchResult<T> {
    return this.request<T>('GET', url, options);
  }

  post<T>(url: string, body: any, options?: any): HttpFetchResult<T> {
    return this.request<T>('POST', url, {body, ...options});
  }

  put<T>(url: string, body: any, options?: any): HttpFetchResult<T> {
    return this.request<T>('PUT', url, {body, ...options});
  }

  delete<T>(url: string, options?: any): HttpFetchResult<T> {
    return this.request<T>('DELETE', url, options);
  }

  patch<T>(url: string, body: any, options?: any): HttpFetchResult<T> {
    return this.request<T>('PATCH', url, {body, ...options});
  }

  request<T>(method: string, url: string, options?: any): HttpFetchResult<T> {
    const statusSignal = signal<HttpStatus>('loading');
    const valueSignal = signal<T | undefined>(undefined);
    const errorSignal = signal<unknown | undefined>(undefined);
    const headersSignal = signal<HttpHeaders | undefined>(undefined);
    const statusCodeSignal = signal<number | undefined>(undefined);
    const progressSignal = signal<HttpProgressEvent | undefined>(undefined);

    const resultPromise = new Promise<T>((resolve, reject) => {
      this.client
        .request<T>(method, url, {
          ...options,
          reportProgress: true,
          observe: 'events',
        })
        .subscribe({
          next: (event: HttpEvent<T>) => {
            switch (event.type) {
              case HttpEventType.Response:
                statusSignal.set('resolved');
                valueSignal.set(event.body as T);
                headersSignal.set(event.headers);
                statusCodeSignal.set(event.status);
                resolve(event.body as T);
                break;
              case HttpEventType.DownloadProgress:
              case HttpEventType.UploadProgress:
                progressSignal.set(event);
                break;
            }
          },
          error: (err: unknown) => {
            statusSignal.set('error');
            errorSignal.set(err);
            if (err instanceof HttpErrorResponse) {
              headersSignal.set(err.headers);
              statusCodeSignal.set(err.status);
            }
            reject(err);
          },
        });
    });

    return {
      status: statusSignal.asReadonly(),
      value: valueSignal.asReadonly(),
      error: errorSignal.asReadonly(),
      isLoading: computed(() => statusSignal() === 'loading'),
      headers: headersSignal.asReadonly(),
      statusCode: statusCodeSignal.asReadonly(),
      progress: progressSignal.asReadonly(),
      result: resultPromise,
    };
  }
}
