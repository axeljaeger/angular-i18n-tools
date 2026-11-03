# Manuelle Schritte für die Veröffentlichung

Bereits erledigt: VSIX-Vorschau 0.0.1 veröffentlicht, Paket in VS Code Web mit
Angular CLI und Nx getestet, Installation über die VS-Code-CLI geprüft,
Codespaces-Konfigurationen und Übersichtsseite bereitgestellt.

## Visual Studio Marketplace

- [ ] In der [Publisher-Verwaltung](https://marketplace.visualstudio.com/manage/publishers/)
  anmelden und Publisher **angular-i18n-tools** anlegen beziehungsweise öffnen.
  Falls eine Vereinbarung angezeigt wird, selbst lesen und bestätigen.
- [ ] Unter **Trusted Publishing** eine Policy anlegen:
  Owner `axeljaeger`, Repository `angular-i18n-tools`, Workflow
  `vscode-extension.yml`, Environment leer. Damit darf dieser Workflow für den
  Publisher veröffentlichen; ein Microsoft-PAT ist nicht nötig.

## Open VSX / Cursor

- [ ] Bei [Open VSX](https://open-vsx.org/) mit GitHub anmelden; ein Eclipse-Konto
  mit demselben GitHub-Benutzernamen anlegen/verknüpfen. Die **Open VSX Publisher
  Agreement** persönlich lesen und bestätigen. Die einzelnen Schritte stehen
  in der [offiziellen Anleitung](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions).
- [ ] Für die Erstveröffentlichung einen Open-VSX-Zugriffstoken erstellen und
  als Actions-Secret **OVSX_PAT** in den
  [Repository-Einstellungen](https://github.com/axeljaeger/angular-i18n-tools/settings/secrets/actions)
  hinterlegen. Den Token nicht in Chat oder Repository-Dateien eintragen.
  Der vorhandene Workflow veröffentlicht bisher nur im Microsoft Marketplace;
  die Open-VSX-Veröffentlichung muss noch ergänzt werden.

Danach kann ich den Namespace **angular-i18n-tools** anlegen und dasselbe
getestete VSIX veröffentlichen. Nach dem Anlegen des Namespace:

- [ ] Die [Namespace-Inhaberschaft beantragen](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access).
  Ein verifizierter Namespace und eine bereits veröffentlichte Version sind
  Voraussetzungen für das spätere tokenlose
  [Open-VSX-Trusted-Publishing](https://www.eclipse.org/lists/openvsx/msg00043.html).
  Dies ist für die erste Veröffentlichung noch nicht erforderlich.

## Codespaces im echten Cloud-Editor prüfen

- [ ] [Angular-Demo](https://codespaces.new/axeljaeger/angular-i18n-tools?quickstart=1&devcontainer_path=.devcontainer%2Fdemo-angular%2Fdevcontainer.json)
  und [Nx-Demo](https://codespaces.new/axeljaeger/angular-i18n-tools?quickstart=1&devcontainer_path=.devcontainer%2Fdemo-nx%2Fdevcontainer.json)
  mit dem eigenen GitHub-Konto starten, Einrichtung abwarten und `DEMO.md`
  durchgehen. Insbesondere den Angular-i18n-Baum, Umbenennen und einen Quick Fix
  ausprobieren. Codespaces-Quota prüfen und die Instanzen danach stoppen.
  Der tatsächliche Cloud-Start ist bislang nicht end-to-end geprüft; Paket,
  Editor-Funktionen und Installationsschritt wurden lokal beziehungsweise in
  GitHub Actions geprüft.

- [ ] Die [VSIX-Vorschau](https://github.com/axeljaeger/angular-i18n-tools/releases/tag/vscode-v0.0.1)
  auch einmal direkt in Cursor über **Extensions: Install from VSIX…**
  installieren und Baum, Navigation, Umbenennen und Quick Fix ausprobieren.
  Die automatisierten Hosttests liefen bisher in VS Code, nicht in Cursor.

## Danach übernehme ich

- Marketplace-Veröffentlichung erneut starten, sobald die Policy existiert.
- Open-VSX-Workflow und Erstveröffentlichung ergänzen, sobald Konto/Vereinbarung
  und Secret bereit sind; dafür ist keine Token-Weitergabe im Chat nötig.
- Erst nach erfolgreicher Veröffentlichung die echten Shop-Links auf der
  Übersichtsseite eintragen und den Pending-Hinweis entfernen.
- Nach der Open-VSX-Inhaberverifizierung auf Trusted Publishing umstellen.
  Anschließend kannst du den alten Open-VSX-Token selbst widerrufen; das
  nicht mehr benötigte Repository-Secret wird ebenfalls entfernt.

Cursor führt eigene Prüfungen über seinen Marketplace-Proxy durch. Eine
Open-VSX-Veröffentlichung bedeutet daher nicht automatisch sofortige
Sichtbarkeit in Cursor. Microsoft- und Open-VSX-Publisher sind getrennte Konten;
die Extension-ID soll auf beiden Registries gleich bleiben.
