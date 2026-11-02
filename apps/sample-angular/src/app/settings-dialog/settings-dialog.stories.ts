import type { Meta, StoryObj } from "@storybook/angular-vite";
import { SettingsDialogComponent } from "./settings-dialog.component";

const meta: Meta<SettingsDialogComponent> = {
  title: "Sample/Settings Dialog",
  component: SettingsDialogComponent
};

export default meta;

type Story = StoryObj<SettingsDialogComponent>;

export const Default: Story = {};
