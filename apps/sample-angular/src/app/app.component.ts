import { Component } from "@angular/core";
import { SettingsDialogComponent } from "./settings-dialog/settings-dialog.component";
import { UserProfileComponent } from "./user-profile/user-profile.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [SettingsDialogComponent, UserProfileComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css"
})
export class AppComponent {
  readonly subtitle = $localize`:Application subtitle@@app.subtitle:Sample workspace for Angular localization tooling.`;
}
