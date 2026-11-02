import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { loadRuntimeTranslations } from "./locale-loader";

loadRuntimeTranslations().then(() => bootstrapApplication(AppComponent)).catch((error: unknown) => {
  console.error(error);
});
