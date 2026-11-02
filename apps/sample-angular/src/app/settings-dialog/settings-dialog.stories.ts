import type { Meta, StoryObj } from "@storybook/angular-vite";
import { SettingsDialogComponent } from "./settings-dialog.component";

const meta: Meta<SettingsDialogComponent> = {
  title: "Plain angular application/Settings Dialog",
  id: "sample-settings-dialog",
  component: SettingsDialogComponent
};

export default meta;

type Story = StoryObj<SettingsDialogComponent>;

export const Default: Story = {};
