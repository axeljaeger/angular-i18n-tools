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
