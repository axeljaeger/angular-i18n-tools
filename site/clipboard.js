document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const command = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(command.textContent);
      button.textContent = "Copied";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(command);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Selected";
      button.title = "Press Ctrl/Cmd+C to copy the selected command";
    }
  });
});

const workspaceButtons = document.querySelectorAll("[data-command]");
workspaceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    workspaceButtons.forEach((choice) => {
      const selected = choice === button;
      choice.setAttribute("aria-pressed", String(selected));
      document.getElementById(choice.dataset.command).hidden = !selected;
    });
    const copyButton = document.querySelector("[data-copy]");
    copyButton.dataset.copy = button.dataset.command;
    copyButton.textContent = "Copy";
    copyButton.removeAttribute("title");
    document.getElementById("command-hint").textContent = button.dataset.command === "nx-command"
      ? "Nx: replace my-app with your app name."
      : "Run in your Angular workspace.";
  });
});
