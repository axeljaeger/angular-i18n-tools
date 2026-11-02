import type { Meta, StoryObj } from "@storybook/angular-vite";
import { SettingsDialogComponent } from "./settings-dialog.component";

const meta: Meta<SettingsDialogComponent> = {
  title: "Angular application in NX workspace/Settings Dialog",
  id: "sample-settings-dialog",
  component: SettingsDialogComponent
};

export default meta;

type Story = StoryObj<SettingsDialogComponent>;

export const Default: Story = {};
