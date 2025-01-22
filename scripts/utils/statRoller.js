import { HM } from '../hero-mancer.js';

const { DialogV2 } = foundry.applications.api;

/**
 * Handles ability score rolling functionality for character creation
 * @class
 */
export class StatRoller {
  /** @type {boolean} Indicates if chain rolling is enabled for the current session */
  static chainRollEnabled = false;

  /** @type {boolean} Tracks if rolling is currently in progress */
  static isRolling = false;

  /**
   * Initiates the stat rolling process
   * @param {HTMLElement} form The form containing the ability score input
   * @throws {Error} If form validation fails or rolling encounters an error
   * @returns {Promise<void>}
   */
  static async roller(form) {
    try {
      const rollFormula = await this.getRollFormula();
      const chainedRolls = await game.settings.get(HM.CONFIG.ID, 'chainedRolls');
      const index = form.getAttribute('data-index');
      const input = this.getAbilityInput(index);

      if (this.hasExistingValues()) {
        await this.showRerollDialog(rollFormula, chainedRolls, index, input);
      } else if (chainedRolls) {
        await this.rollAllStats(rollFormula);
      } else {
        await this.performSingleRoll(rollFormula, index, input);
      }
    } catch (error) {
      HM.log(3, 'Error while rolling stat:', error, 'error');
      this.isRolling = false;
      throw error;
    }
  }

  /**
   * Gets the roll formula from settings or sets default
   * @returns {Promise<string>} The roll formula to use
   */
  static async getRollFormula() {
    let formula = game.settings.get(HM.CONFIG.ID, 'customRollFormula');
    if (!formula?.trim()) {
      formula = '4d6kh3';
      await game.settings.set(HM.CONFIG.ID, 'customRollFormula', formula);
      HM.log(3, 'Roll formula was empty. Resetting to default:', formula);
    }
    return formula;
  }

  /**
   * Gets the ability score input element
   * @param {string} index The ability block index
   * @returns {HTMLElement|null} The input element or null if not found
   */
  static getAbilityInput(index) {
    const block = document.getElementById(`ability-block-${index}`);
    return block?.querySelector('.ability-score');
  }

  /**
   * Checks if any ability scores have existing values
   * @returns {boolean} True if any ability scores have values
   */
  static hasExistingValues() {
    return Array.from(document.querySelectorAll('.ability-score')).some((input) => input.value?.trim() !== '');
  }

  /**
   * Shows the reroll confirmation dialog
   * @param {string} rollFormula The formula to use for rolling
   * @param {boolean} chainedRolls Whether chained rolls are enabled
   * @param {string} index The ability block index
   * @param {HTMLElement} input The ability score input element
   * @returns {Promise<void>}
   */
  static async showRerollDialog(rollFormula, chainedRolls, index, input) {
    const dialog = new DialogV2({
      window: {
        title: game.i18n.localize(`${HM.CONFIG.ABRV}.dialogs.reroll.title`),
        icon: 'fas fa-dice-d6'
      },
      content: this.getRerollDialogContent(),
      classes: ['hm-reroll-dialog'],
      buttons: this.getRerollDialogButtons(rollFormula, chainedRolls, index, input),
      rejectClose: false,
      modal: true,
      position: { width: 400 }
    });

    dialog.render(true);
  }

  /**
   * Gets the content for the reroll dialog
   * @returns {string} The HTML content for the dialog
   */
  static getRerollDialogContent() {
    return `
      <form class="dialog-form">
        <p>${game.i18n.localize(`${HM.CONFIG.ABRV}.dialogs.reroll.content`)}</p>
        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="chainRoll" ${this.chainRollEnabled ? 'checked' : ''}>
            ${game.i18n.localize(`${HM.CONFIG.ABRV}.dialogs.reroll.chain-roll-label`)}
          </label>
        </div>
      </form>
    `;
  }

  /**
   * Gets the button configuration for the reroll dialog
   * @param {string} rollFormula The formula to use for rolling
   * @param {boolean} chainedRolls Whether chained rolls are enabled
   * @param {string} index The ability block index
   * @param {HTMLElement} input The ability score input element
   * @returns {object[]} The button configurations
   */
  static getRerollDialogButtons(rollFormula, chainedRolls, index, input) {
    return [
      {
        action: 'confirm',
        label: game.i18n.localize(`${HM.CONFIG.ABRV}.dialogs.reroll.confirm`),
        icon: 'fas fa-check',
        default: true,
        async callback(event, button, dialog) {
          const chainRollCheckbox = button.form.elements.chainRoll;
          StatRoller.chainRollEnabled = chainRollCheckbox?.checked ?? false;

          dialog.close();

          if (StatRoller.chainRollEnabled && chainedRolls) {
            await StatRoller.rollAllStats(rollFormula);
          } else {
            await StatRoller.performSingleRoll(rollFormula, index, input);
          }
        }
      },
      {
        action: 'cancel',
        label: game.i18n.localize(`${HM.CONFIG.ABRV}.dialogs.reroll.cancel`),
        icon: 'fas fa-times'
      }
    ];
  }

  /**
   * Performs a single ability score roll
   * @param {string} rollFormula The formula to use for rolling
   * @param {string} index The ability block index
   * @param {HTMLElement} input The ability score input element
   * @returns {Promise<void>}
   */
  static async performSingleRoll(rollFormula, index, input) {
    const roll = new Roll(rollFormula);
    await roll.evaluate();
    HM.log(3, 'Roll result:', roll.total);

    if (input) {
      input.value = roll.total;
      input.focus();
      HM.log(3, `Updated input value for ability index ${index} with roll total:`, roll.total);
    } else {
      HM.log(3, `No input field found for ability index ${index}.`, 'error');
    }
  }

  /**
   * Rolls all ability scores in sequence
   * @param {string} rollFormula The formula to use for rolling
   * @returns {Promise<void>}
   */
  static async rollAllStats(rollFormula) {
    const blocks = document.querySelectorAll('.ability-block');
    const delay = game.settings.get(HM.CONFIG.ID, 'rollDelay') || 500;
    this.isRolling = true;

    try {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const roll = new Roll(rollFormula);
        await roll.evaluate();

        const input = block.querySelector('.ability-score');
        if (input) {
          input.value = roll.total;
          input.focus();

          const diceIcon = block.querySelector('.fa-dice-d6');
          if (diceIcon) {
            diceIcon.classList.add('rolling');
            setTimeout(() => diceIcon.classList.remove('rolling'), delay - 100);
          }
        }

        if (i < blocks.length - 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
        }
      }
    } finally {
      this.isRolling = false;
    }
  }

  /**
   * Gets the default standard array for ability scores
   * @returns {string} Comma-separated string of ability scores
   */
  static getStandardArrayDefault() {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraAbilities = Math.max(0, abilitiesCount - 6);
    return this.getStandardArray(extraAbilities).map(String).join(',');
  }

  /**
   * Validates and sets a custom standard array
   * @param {string} value Comma-separated string of ability scores
   */
  static validateAndSetCustomStandardArray(value) {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;

    if (!/^(\d+,)*\d+$/.test(value)) {
      ui.notifications.warn(game.i18n.localize('hm.settings.custom-standard-array.invalid-format'));
      return;
    }

    let scores = value.split(',').map(Number);
    if (scores.length < abilitiesCount) {
      scores = this.getStandardArrayDefault().split(',').map(Number);
      ui.notifications.info(game.i18n.localize('hm.settings.custom-standard-array.reset-default'));
    }

    game.settings.set(HM.CONFIG.ID, 'customStandardArray', scores.sort((a, b) => b - a).join(','));
  }

  /**
   * Generates a standard array of ability scores
   * @param {number} extraAbilities Number of additional abilities beyond the base six
   * @returns {number[]} Array of ability scores in descending order
   */
  static getStandardArray(extraAbilities) {
    const scores = [15, 14, 13, 12, 10, 8, ...Array(extraAbilities).fill(11)];
    return scores.sort((a, b) => b - a);
  }

  /**
   * Calculates total points available for point buy
   * @returns {number} Total points available
   */
  static getTotalPoints() {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraPoints = Math.max(0, abilitiesCount - 6) * 3;
    return 27 + extraPoints;
  }

  /**
   * Gets the point cost for a given ability score
   * @param {number} score The ability score (8-15)
   * @returns {number} Point cost for the score
   */
  static getPointCost(score) {
    const costs = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    return costs[score] ?? 0;
  }

  /**
   * Calculates total points spent on ability scores
   * @param {number[]} scores Array of selected ability scores
   * @returns {number} Total points spent
   */
  static calculatePointsSpent(scores) {
    return scores.reduce((total, score) => total + this.getPointCost(score), 0);
  }
}
