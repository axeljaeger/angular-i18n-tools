import { Component } from "@angular/core";

@Component({
  selector: "app-settings-dialog",
  standalone: true,
  templateUrl: "./settings-dialog.component.html",
  styleUrl: "./settings-dialog.component.css"
})
export class SettingsDialogComponent {
  readonly description = $localize`:Settings dialog description@@settingsDialog.description:Choose how the application should behave.`;
}
