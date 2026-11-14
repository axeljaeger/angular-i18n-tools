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
  readonly currentLocale = document.documentElement.lang === "en" ? "en-US" : document.documentElement.lang;
  readonly languages = [
    { locale: "en-US", name: "English", flag: "🇺🇸" },
    { locale: "de", name: "Deutsch", flag: "🇩🇪" },
    { locale: "fr", name: "Français", flag: "🇫🇷" }
  ].map((language) => {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("locale", language.locale);
    return { ...language, href: url.href };
  });
}
