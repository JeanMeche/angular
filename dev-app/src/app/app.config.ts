import {ApplicationConfig, provideBrowserGlobalErrorListeners, ErrorHandler} from '@angular/core';
import {provideRouter} from '@angular/router';

class CustomErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    console.error('[CUSTOM ERROR HANDLER] Caught error:', error);
  }
  onViewError?(error: any, details: any): void {
    console.error('[CUSTOM ERROR HANDLER] Caught boundary error:', error, details);
  }
}

import {routes} from './app.routes';
import {provideClientHydration, withEventReplay} from '@angular/platform-browser';
import {provideHttpClient, withFetch} from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    {provide: ErrorHandler, useClass: CustomErrorHandler},
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
  ],
};
