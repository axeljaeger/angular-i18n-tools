# Try Angular i18n Tools

This is the **plain Angular CLI** demo. The extension is installed from the VS Code Marketplace
automatically when this Codespace finishes setting up. If the **Angular i18n**
view is not visible in Explorer, run **Developer: Reload Window** once.

1. Expand **Angular i18n** in the Explorer. Browse `settingsDialog` and
   `userProfile`; select an ID to open its source.
2. Right-click an ID and choose **Open Translation…** to jump to German or
   French text in `src/locale/messages.<locale>.json`.
3. In a template, put the cursor inside `settingsDialog.applyButton` and press
   **F2**. Review the source and catalog edits, then undo to restore the demo.
4. Delete `userProfile.name` from the German catalog. Open the user profile
   template, see the diagnostic, and try **Quick Fix → Add missing de
   translation**. The new text is empty for you to translate; undo afterward.

This extension edits message IDs and catalogs. Changing the application language
is demonstrated separately by the [Storybook language switcher](https://axeljaeger.github.io/angular-i18n-tools/angular/storybook/).

[Open the other Codespaces demo](https://codespaces.new/axeljaeger/angular-i18n-tools?quickstart=1&devcontainer_path=.devcontainer%2Fdemo-nx%2Fdevcontainer.json).
Each demo opens one project so copied IDs from the two independent samples are
not combined into one catalog. Stop your Codespace when finished to stop compute
usage; delete it when you no longer need its files.

[Project and documentation](https://github.com/axeljaeger/angular-i18n-tools)
