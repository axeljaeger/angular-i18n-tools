import type { Meta, StoryObj } from "@storybook/angular";
import { DemoCardComponent } from "./demo-card.component";

const meta: Meta<DemoCardComponent> = {
  title: "Dogfood/Published Addon",
  component: DemoCardComponent
};

export default meta;

type Story = StoryObj<DemoCardComponent>;

export const Default: Story = {};
