import { Component } from "@angular/core";

@Component({
  selector: "demo-card",
  standalone: true,
  styleUrl: "./demo-card.component.css",
  templateUrl: "./demo-card.component.html"
})
export class DemoCardComponent {
  readonly body = $localize`:Storybook dogfood body@@storybookDemo.body:This demo consumes the published Storybook addon package.`;
}
