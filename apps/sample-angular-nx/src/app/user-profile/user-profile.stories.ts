import type { Meta, StoryObj } from "@storybook/angular-vite";
import { UserProfileComponent } from "./user-profile.component";

const meta: Meta<UserProfileComponent> = {
  title: "Angular application in NX workspace/User Profile",
  id: "sample-user-profile",
  component: UserProfileComponent
};

export default meta;

type Story = StoryObj<UserProfileComponent>;

export const Default: Story = {};
