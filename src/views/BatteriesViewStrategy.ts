// ====================================================================
// VIEW STRATEGY — BATTERIES (Battery Status Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';
import { getBatteryEntities } from '../utils/entity-filter';


/**
 * Interface for battery group data used in BatteriesView and batteries SummaryCard.
 * Grouped by status (critical, low, good, unknown) based on state and config thresholds.
 * Includes icon, info text, color for UI, and list of entity IDs in the group.
 */
export interface BatteryGroup {
  entities: string[];
  style: {
    icon: string;
    color: string;
    info: string | null;
  };
}

class Simon42ViewBatteriesStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Ensure Registry is initialized (idempotent — no-op if already done)
    Registry.initialize(hass, config.config || {});

    // Group by status
    const strategyConfig = config.config || {};
    const criticalThreshold = strategyConfig.battery_critical_threshold ?? 20;
    const lowThreshold = strategyConfig.battery_low_threshold ?? 50;

    const batteryGroups: Record<string, BatteryGroup> = {
      'unknown':  { entities: [], style: { icon: 'mdi:battery-unknown', info: null, color: 'white',  } },
      'critical': { entities: [], style: { icon: 'mdi:battery-alert', info: `< ${criticalThreshold}%`, color: 'red',  } },
      'low':      { entities: [], style: { icon: `mdi:battery-20`, info: `${criticalThreshold}% - ${lowThreshold}%`, color: 'yellow',  } },
      'good':     { entities: [], style: { icon: 'mdi:battery', info: `> ${lowThreshold}%`, color: 'green',  } },
    };
    
    for (const entityId of getBatteryEntities(hass, strategyConfig)) {

      let key: string;
      
      const state = hass.states[entityId];
      if (strategyConfig.show_unknown_battery_group && (
        state.state === 'unavailable' || state.state === 'unknown'
      )) {
        key = 'unknown';
      } else if (entityId.startsWith('binary_sensor.')) {
        key = state.state === 'on' ? 'critical' : 'good';
      } else {
        const value = parseFloat(state.state);
        const unit = state.attributes?.unit_of_measurement;
        // Only apply percentage thresholds to %-based sensors.
        // Voltage sensors (V, mV) have device-specific ranges and cannot be
        // meaningfully compared against percentage thresholds (e.g. 3V would
        // be "critical" at < 20 which is wrong). Skip them entirely.
        if (unit && unit !== '%') continue;
        if (isNaN(value)) key = 'critical';
        else if (value < criticalThreshold) key = 'critical';
        else if (value <= lowThreshold) key = 'low';
        else key = 'good';
      }

      batteryGroups[key].entities.push(entityId);
    }
  
    const sections: LovelaceSectionConfig[] = [];

    // Build sections based on grid groups
    for (const key of Object.keys(batteryGroups)) {
      
      const entities = batteryGroups[key].entities;
      if (!entities || entities.length === 0) continue;

      entities.sort((a, b) => {
        const valA = parseFloat(hass.states[a]?.state);
        const valB = parseFloat(hass.states[b]?.state);
        if (isNaN(valA)) return -1;
        if (isNaN(valB)) return 1;
        return valA - valB;
      });

      const style = batteryGroups[key].style;
      const oneOrMany = entities.length === 1 ? 'battery_one' : 'battery_many';
      sections.push({
        type: 'grid',
        cards: [
          {
            type: 'heading',
            heading: `${localize('batteries.' + key)} ` + (style.info ? `(${style.info})` : '') +
                ` - ${entities.length} ${localize('batteries.' + oneOrMany)}`,
            heading_style: 'title',
            icon: style.icon,
          },
          ...entities.map((e) => ({
            type: 'tile',
            entity: e,
            vertical: false,
            state_content: ['state', 'last_changed'],
            color: style.color,
          })),
        ],
      });
    }

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-batteries', Simon42ViewBatteriesStrategy);
