import type { Meta, StoryObj } from "@storybook/angular";
import { UserProfileComponent } from "./user-profile.component";

const meta: Meta<UserProfileComponent> = {
  title: "Sample/User Profile",
  component: UserProfileComponent
};

export default meta;

type Story = StoryObj<UserProfileComponent>;

export const Default: Story = {};
