import "@angular/localize/init";
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { DemoCardComponent } from "./demo-card/demo-card.component";
import { loadRuntimeTranslations } from "./locale-loader";

@Component({
  selector: "demo-root",
  standalone: true,
  imports: [DemoCardComponent],
  template: "<demo-card />"
})
class DemoRootComponent {}

void loadRuntimeTranslations().then(() => bootstrapApplication(DemoRootComponent));
