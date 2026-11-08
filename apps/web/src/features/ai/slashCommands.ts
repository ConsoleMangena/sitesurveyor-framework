/**
 * The `/` menu in the AI composer.
 *
 * Each entry is a survey questionnaire the assistant can run, not a template
 * string: the composer only inserts `template` and the runtime does the work,
 * so an entry that names a survey type the ai-chat tool surface cannot launch
 * would be a broken command. Keep this list beside the tool definitions when
 * either side changes.
 *
 * This module holds data only. It lives outside AssistantPage.tsx because that
 * file exports a component, and Vite's fast refresh refuses to hot-reload a
 * module that mixes component and non-component exports.
 */

export interface SlashCommand {
  name: string;
  alias?: string;
  title: string;
  category: "water" | "minerals" | "hazard" | "soil" | "eo";
  description: string;
  example: string;
  template: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "/borehole",
    alias: "/water",
    title: "Groundwater & Boreholes",
    category: "water",
    description: "AI Questionnaire: borehole siting, aquifer potential & precision drill targets",
    example: "/borehole",
    template: "/borehole",
  },
  {
    name: "/minerals",
    alias: "/prospect",
    title: "Mineral Exploration",
    category: "minerals",
    description: "AI Questionnaire: hydrothermal alteration, gossans & gold shear lineaments",
    example: "/minerals",
    template: "/minerals",
  },
  {
    name: "/hazard",
    alias: "/flood",
    title: "Natural Hazards & Safety",
    category: "hazard",
    description: "AI Questionnaire: 40-yr flood screening, slope failure risk & buildable sites",
    example: "/hazard",
    template: "/hazard",
  },
  {
    name: "/soil",
    alias: "/agri",
    title: "Soil & Land Capability",
    category: "soil",
    description: "AI Questionnaire: agricultural land suitability, crop health & erosion risk",
    example: "/soil",
    template: "/soil",
  },
  {
    name: "/eo",
    alias: "/sat",
    title: "Earth Observation Survey",
    category: "eo",
    description: "AI Questionnaire: interactive guide for any single-domain satellite survey",
    example: "/eo",
    template: "/eo",
  },
];
