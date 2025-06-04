import { Feature, Scenario, Step, Tag, Background } from '@cucumber/messages';

export interface FeatureChild {
  scenario?: Scenario;
  background?: Background;
  rule?: any; // Add if needed
}

export { Feature, Scenario, Step, Tag, Background };
