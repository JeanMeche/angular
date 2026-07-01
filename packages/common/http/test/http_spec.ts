/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {TestBed} from '@angular/core/testing';
import {Http} from '../src/http';
import {provideHttpClient} from '../src/provider';
import {HttpTestingController, provideHttpClientTesting} from '../testing';

describe('Http Service', () => {
  let http: Http;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(Http);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should fetch data using Promises and update Signals', async () => {
    const result = http.get<{data: string}>('/api/data');

    // Initial state before response
    expect(result.status()).toBe('loading');
    expect(result.isLoading()).toBeTrue();
    expect(result.value()).toBeUndefined();
    expect(result.error()).toBeUndefined();

    // Mock the HTTP request
    const req = httpTestingController.expectOne('/api/data');
    expect(req.request.method).toBe('GET');

    // Flush response
    req.flush({data: 'success'});

    // Await the promise
    const responseData = await result.result;

    // Check states after resolution
    expect(responseData).toEqual({data: 'success'});
    expect(result.status()).toBe('resolved');
    expect(result.isLoading()).toBeFalse();
    expect(result.value()).toEqual({data: 'success'});
    expect(result.error()).toBeUndefined();
    expect(result.statusCode()).toBe(200);
  });

  it('should handle errors correctly', async () => {
    const result = http.get<{data: string}>('/api/error');

    // Initial state
    expect(result.status()).toBe('loading');
    expect(result.isLoading()).toBeTrue();

    const req = httpTestingController.expectOne('/api/error');
    req.flush('Not Found', {status: 404, statusText: 'Not Found'});

    try {
      await result.result;
      fail('Promise should have rejected');
    } catch (e: any) {
      expect(e.status).toBe(404);
    }

    expect(result.status()).toBe('error');
    expect(result.isLoading()).toBeFalse();
    expect(result.error()).toBeTruthy();
    expect((result.error() as any).status).toBe(404);
    expect(result.statusCode()).toBe(404);
  });
});
