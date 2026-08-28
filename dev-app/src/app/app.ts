import {Component, signal} from '@angular/core';
import {RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-buggy',
  standalone: true,
  template: `
    <div style="margin: 20px 0;">
      <p>{{ getBuggyData() }}</p>
      <button (click)="crash()">Crash App</button>
    </div>
  `,
})
export class BuggyComponent {
  shouldCrash = signal(false);

  crash() {
    this.shouldCrash.set(true);
  }

  getBuggyData() {
    if (this.shouldCrash()) {
      throw new Error('This is a simulated render error from BuggyComponent!');
    }
    return 'Everything is fine... for now.';
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BuggyComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('dev-app');
}
