/**
 * SYSTEM PRICE CALCULATOR - Application Logic & UI Controllers
 * Extracted from index.html (depends on price-data.js loaded first)
 */

    // Active Product Category State (FAA, DROP A, OZTECH, LOUVRE)
    let activeCategory = "FAA";

    function getCurrentProductKey() {
      if (activeCategory === 'DROP A') {
        return document.getElementById('dropASubSelect').value;
      }
      if (activeCategory === 'LOUVRE') {
        return document.getElementById('louvreProductSelect').value;
      }
      if (activeCategory === 'OZTECH') {
        return document.getElementById('oztechSubSelect').value;
      }
      return document.getElementById('productSelect').value;
    }

    function getCurrentProduct() {
      return DB.products[getCurrentProductKey()];
    }

    function getCurrentSupplyType() {
      if (activeCategory === 'DROP A' || activeCategory === 'LOUVRE' || activeCategory === 'OZTECH') {
        return 'complete';
      }
      return document.getElementById('supplyTypeSelect').value; // 'complete' or 'kit'
    }

    function getCurrentOztechModuleInfo() {
      const modKey = document.getElementById('oztechModuleSelect')?.value || 'single';
      const product = getCurrentProduct();
      if (product && product.moduleConfig && product.moduleConfig[modKey]) {
        return product.moduleConfig[modKey];
      }
      return DB.oztechModules[modKey] || DB.oztechModules.single;
    }

    function isOztechOverhangChecked() {
      return Boolean(document.getElementById('oztechOverhangCheck')?.checked);
    }

    function getLouvreBladeMatch(product, rawProj) {
      if (!product || !product.bladeRanges || isNaN(rawProj)) return null;
      const exact = product.bladeRanges.find(b => rawProj >= b.min && rawProj <= b.max);
      if (exact) {
        return { valid: true, match: exact, lower: null, upper: null };
      }
      let lower = null;
      let upper = null;
      for (const b of product.bladeRanges) {
        if (b.max < rawProj) lower = b;
        if (b.min > rawProj && !upper) upper = b;
      }
      return { valid: false, match: null, lower, upper };
    }

    function applySuggestedProjection(targetProj) {
      const projInput = document.getElementById('projInput');
      if (!projInput) return;
      projInput.value = targetProj;
      calculatePrice(false);
    }

    function renderNearestProjSuggestions(bladeCheck, rawProj, product) {
      const formBox = document.getElementById('nearestProjSuggestBox');
      const quoteBox = document.getElementById('quoteNearestProjBox');
      if (!formBox || !quoteBox) return;

      if (!bladeCheck || bladeCheck.valid || activeCategory !== 'LOUVRE') {
        formBox.style.display = 'none';
        formBox.innerHTML = '';
        quoteBox.style.display = 'none';
        quoteBox.innerHTML = '';
        return;
      }

      const candidates = [];
      if (bladeCheck.lower) {
        const b = bladeCheck.lower;
        const closestVal = b.max;
        const diff = closestVal - rawProj;
        candidates.push({
          proj: closestVal,
          blades: b.blades,
          rangeText: `${b.min.toLocaleString()} ~ ${b.max.toLocaleString()} mm`,
          dirLabel: `▼ Lower (${b.blades} Blades)`,
          diffLabel: `${diff > 0 ? '+' : ''}${diff} mm`
        });
      }
      if (bladeCheck.upper) {
        const b = bladeCheck.upper;
        const closestVal = b.min;
        const diff = closestVal - rawProj;
        candidates.push({
          proj: closestVal,
          blades: b.blades,
          rangeText: `${b.min.toLocaleString()} ~ ${b.max.toLocaleString()} mm`,
          dirLabel: `▲ Upper (${b.blades} Blades)`,
          diffLabel: `${diff > 0 ? '+' : ''}${diff} mm`
        });
      }

      const btnHtml = candidates.map(c => `
        <button type="button" class="nearest-proj-btn" data-proj="${c.proj}">
          <span class="nearest-proj-btn-top">
            <span>${c.proj.toLocaleString()} mm</span>
            <span class="nearest-proj-btn-diff">${c.diffLabel}</span>
          </span>
          <span class="nearest-proj-btn-sub">${c.dirLabel} • Span: ${c.rangeText}</span>
        </button>
      `).join('');

      const selectOptionsHtml = (product && product.bladeRanges)
        ? product.bladeRanges.map(b => {
            const isNear = (bladeCheck.lower && b.blades === bladeCheck.lower.blades) ||
                           (bladeCheck.upper && b.blades === bladeCheck.upper.blades);
            const tag = isNear ? ' ★ Nearest' : '';
            const pickVal = (bladeCheck.lower && b.blades === bladeCheck.lower.blades) ? b.max : b.min;
            return `<option value="${pickVal}">${b.blades} Blades: ${b.min.toLocaleString()} ~ ${b.max.toLocaleString()} mm (Apply ${pickVal.toLocaleString()} mm)${tag}</option>`;
          }).join('')
        : '';

      const maxBlades = (product && product.bladeRanges)
        ? product.bladeRanges[product.bladeRanges.length - 1].blades
        : 35;

      const boxMarkup = `
        <div class="nearest-proj-title">
          <span>⚠️ ${rawProj.toLocaleString()} mm is in an unbuildable blade gap — Select a valid projection:</span>
        </div>
        <div class="nearest-proj-grid">${btnHtml}</div>
        <div class="nearest-proj-select-wrap">
          <select class="nearest-proj-dropdown">
            <option value="">Or select any buildable blade span (4 ~ ${maxBlades} Blades)...</option>
            ${selectOptionsHtml}
          </select>
        </div>
      `;

      [formBox, quoteBox].forEach(container => {
        container.innerHTML = boxMarkup;
        container.style.display = 'block';
        container.querySelectorAll('.nearest-proj-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            applySuggestedProjection(parseInt(this.dataset.proj, 10));
          });
        });
        const sel = container.querySelector('.nearest-proj-dropdown');
        if (sel) {
          sel.addEventListener('change', function() {
            if (this.value) {
              applySuggestedProjection(parseInt(this.value, 10));
            }
          });
        }
      });
    }

    function getLouvreModuleType(product, matchedWidth) {
      if (!product) return 'Single Module';
      if (product.moduleGroups && matchedWidth) {
        const grp = product.moduleGroups.find(g => g.widths.includes(matchedWidth));
        if (grp) return grp.label;
      }
      return product.moduleType || 'Single Module';
    }

    function getLouvreLedPrice(product, projTier, widthTier) {
      if (!product || !product.ledPrices || !projTier || !widthTier) return null;
      const row = product.ledPrices[projTier];
      if (!row) return null;
      if (product.ledWidths) {
        const lw = product.ledWidths.find(x => x >= widthTier);
        if (!lw) return null;
        return row[lw] !== undefined ? row[lw] : null;
      }
      return row[widthTier] !== undefined ? row[widthTier] : null;
    }

    function getActiveWidths(product, supplyType) {
      if (activeCategory === 'OZTECH') {
        const modInfo = getCurrentOztechModuleInfo();
        return [...modInfo.widths, ...modInfo.overhangWidths];
      }
      if (supplyType === 'kit' && product.kitWidths) {
        return product.kitWidths;
      }
      return product.widths;
    }

    function getActivePriceMatrix(product, supplyType) {
      if (activeCategory === 'OZTECH') {
        const modKey = document.getElementById('oztechModuleSelect')?.value || 'single';
        return (product && product.modulePrices) ? product.modulePrices[modKey] : null;
      }
      if (activeCategory === 'DROP A') {
        const op = document.getElementById('operationSelect').value;
        if (op === 'spring') {
          return product.springPrices || null;
        }
        if (op === 'motorised' && product.motorisedPrices) {
          return product.motorisedPrices;
        }
        return product.prices;
      }
      if (supplyType === 'kit') {
        return product.kitPrices;
      }
      return product.prices;
    }

    function getActiveMotors(product) {
      if (product && product.motors) {
        return product.motors;
      }
      if (activeCategory === 'FAA') {
        return DB.motors;
      }
      return null;
    }

    const OZTECH_BRACKET_IDS = ['fascia_rafter_10', 'fascia_rafter_22', 'roof_tile_rafter'];

    function getActiveBrackets(product) {
      if (activeCategory === 'FAA') {
        return DB.bracketsAndExtras;
      }
      if (activeCategory === 'OZTECH') {
        return OZTECH_BRACKET_IDS
          .map(id => DB.bracketsAndExtras.find(b => b.id === id))
          .filter(Boolean);
      }
      if (activeCategory === 'DROP A' && product && product.group === 'GENIUS') {
        return DB.geniusBrackets;
      }
      return null;
    }

    function updateMotorButtonsUI() {
      const opSelect = document.getElementById('operationSelect');
      const motorSelect = document.getElementById('motorSelect');
      const oztechMotorTabs = document.getElementById('oztechMotorTabs');
      const opVal = opSelect ? opSelect.value : 'manual';
      const isMotorised = opVal === 'motorised' || activeCategory === 'OZTECH' || activeCategory === 'LOUVRE';
      const curMotor = motorSelect ? motorSelect.value : 'ace';

      if (oztechMotorTabs) {
        oztechMotorTabs.style.opacity = isMotorised ? '1' : '0.68';
      }
      document.querySelectorAll('#oztechMotorTabs .oztech-motor-btn').forEach(b => {
        b.classList.toggle('active', isMotorised && b.dataset.motor === curMotor);
      });
    }

    function populateMotorOptions(resetToDefault = false) {
      const motorSelect = document.getElementById('motorSelect');
      const oztechMotorTabs = document.getElementById('oztechMotorTabs');
      const operationGroup = document.getElementById('operationGroup');
      const motorGroup = document.getElementById('motorGroup');
      const motorFieldLabel = document.getElementById('motorFieldLabel');
      const prevVal = motorSelect.value;
      const product = getCurrentProduct();
      const activeMotors = getActiveMotors(product) || DB.motors;
      motorSelect.innerHTML = '';

      Object.entries(activeMotors).forEach(([mKey, mData]) => {
        const opt = document.createElement('option');
        opt.value = mKey;
        opt.textContent = mData.name;
        motorSelect.appendChild(opt);
      });

      const validVals = Object.keys(activeMotors);
      if (resetToDefault) {
        motorSelect.value = validVals[0] || 'ace';
      } else {
        motorSelect.value = validVals.includes(prevVal) ? prevVal : validVals[0] || 'ace';
      }

      if (operationGroup) {
        operationGroup.style.gridColumn = '1 / -1';
        operationGroup.style.display = activeCategory === 'OZTECH' ? 'none' : 'block';
      }
      if (motorGroup) {
        motorGroup.style.gridColumn = '1 / -1';
      }
      if (motorFieldLabel) {
        motorFieldLabel.textContent = activeCategory === 'OZTECH'
          ? 'Motor Brand (Motorised)'
          : 'Motor Brand';
      }
      motorSelect.style.display = 'none';

      if (oztechMotorTabs) {
        oztechMotorTabs.style.display = 'grid';
        oztechMotorTabs.style.gridTemplateColumns = `repeat(${Math.min(validVals.length || 1, 4)}, 1fr)`;
        oztechMotorTabs.innerHTML = '';
        Object.entries(activeMotors).forEach(([mKey, mData]) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sub-type-btn oztech-motor-btn';
          btn.dataset.motor = mKey;
          const btnTitle = mData.shortName || mData.name;
          const btnSub = activeCategory === 'OZTECH' ? '' : (mData.subDesc || '');
          btn.innerHTML = btnSub
            ? `<span>${btnTitle}</span><span class="sub-type-desc">${btnSub}</span>`
            : `<span>${btnTitle}</span>`;
          btn.addEventListener('click', function() {
            const opSelect = document.getElementById('operationSelect');
            const wasNotMotorised = opSelect && opSelect.value !== 'motorised' && activeCategory !== 'OZTECH' && activeCategory !== 'LOUVRE';
            if (wasNotMotorised) {
              opSelect.value = 'motorised';
              motorSelect.disabled = false;
            }
            motorSelect.value = mKey;
            updateMotorButtonsUI();
            if (wasNotMotorised && activeCategory === 'DROP A') {
              renderTable();
            }
            motorSelect.dispatchEvent(new Event('change'));
          });
          oztechMotorTabs.appendChild(btn);
        });
      }

      updateMotorButtonsUI();
      populateDimmerOptions();
    }

    function isOztechGutterLedExcluded(product) {
      if (!product) return false;
      const excludedGroups = DB.oztechLedLighting?.gutter_led?.excludedGroups || ['IZI', 'IZI SLOPE', 'MUSE'];
      const excludedSubTypes = DB.oztechLedLighting?.gutter_led?.excludedSubTypes || ['CANTILEVER'];
      return excludedGroups.includes(product.group) || excludedSubTypes.includes(product.subType);
    }

    function updateOnsiteAssemblyUI() {
      const cb = document.getElementById('onsiteAssemblyCheck');
      const btn = document.getElementById('onsiteAssemblyBtn');
      const titleEl = document.getElementById('onsiteAssemblyTitleText');
      const badge = document.getElementById('onsiteAssemblyBadge');
      const subtext = document.getElementById('onsiteAssemblySubtext');
      const isChecked = Boolean(cb && cb.checked);
      if (btn) btn.classList.toggle('active', isChecked);
      if (titleEl) {
        titleEl.textContent = isChecked
          ? '✓ On-Site Fabric Assembly (-7%)'
          : 'On-Site Fabric Assembly (-7%)';
      }
      if (badge) badge.textContent = isChecked ? '-7% Applied' : '0%';
      if (subtext) {
        subtext.textContent = isChecked
          ? '7% discount applied to Base System Price (Click again to cancel)'
          : 'Click to apply a 7% discount when fabric skins are assembled on site';
      }
    }

    function populateDimmerOptions() {
      const dimmerGroup = document.getElementById('louvreDimmerGroup');
      const dimmerLabel = document.getElementById('louvreDimmerLabel');
      const dimmerSelect = document.getElementById('louvreDimmerSelect');
      const dimmerHint = document.getElementById('louvreDimmerHint');
      if (!dimmerGroup || !dimmerSelect || !dimmerHint) return;

      if (activeCategory !== 'LOUVRE' && activeCategory !== 'OZTECH') {
        dimmerGroup.style.display = 'none';
        return;
      }

      dimmerGroup.style.display = 'block';
      const prevVal = dimmerSelect.value;
      const motorKey = document.getElementById('motorSelect').value;
      dimmerSelect.innerHTML = '';

      if (activeCategory === 'OZTECH') {
        if (dimmerLabel) dimmerLabel.textContent = 'Remote Dimmer';
        const ledKey = document.getElementById('ledSelect').value;
        if (ledKey === 'uniled') {
          if (motorKey === 'becker') {
            [
              { value: 'no', label: 'No Dimmer (+$0)' },
              { value: 'yes', label: 'Remote Dimmer (+$350)' }
            ].forEach(item => {
              const opt = document.createElement('option');
              opt.value = item.value;
              opt.textContent = item.label;
              dimmerSelect.appendChild(opt);
            });
            dimmerSelect.disabled = false;
            dimmerSelect.value = prevVal === 'yes' ? 'yes' : 'no';
            dimmerHint.textContent = '* Standard LED (UNILED): Optional Remote Dimming Control is +$350 (Becker Only)';
          } else {
            const opt = document.createElement('option');
            opt.value = 'no';
            opt.textContent = 'ON-OFF Only (Becker Required)';
            dimmerSelect.appendChild(opt);
            dimmerSelect.value = 'no';
            dimmerSelect.disabled = true;
            dimmerHint.textContent = '* Standard LED (UNILED) Optional Remote Dimming Control ($350) requires Becker Motor';
          }
        } else if (ledKey === 'maxi_led') {
          if (motorKey === 'becker' || motorKey === 'somfy') {
            [
              { value: 'no', label: 'No Dimmer (+$0)' },
              { value: 'yes', label: 'Remote Dimmer (+$200)' }
            ].forEach(item => {
              const opt = document.createElement('option');
              opt.value = item.value;
              opt.textContent = item.label;
              dimmerSelect.appendChild(opt);
            });
            dimmerSelect.disabled = false;
            dimmerSelect.value = prevVal === 'yes' ? 'yes' : 'no';
            dimmerHint.textContent = '* Maxi (Full Width) LED: Optional Remote Dimming Control is +$200 (Becker & Somfy)';
          } else {
            const opt = document.createElement('option');
            opt.value = 'no';
            opt.textContent = 'ON-OFF Only (Becker/Somfy Required)';
            dimmerSelect.appendChild(opt);
            dimmerSelect.value = 'no';
            dimmerSelect.disabled = true;
            dimmerHint.textContent = '* Maxi LED Optional Remote Dimming Control ($200) requires Becker or Somfy Motor';
          }
        } else {
          const opt = document.createElement('option');
          opt.value = 'no';
          opt.textContent = 'Select Main LED First';
          dimmerSelect.appendChild(opt);
          dimmerSelect.value = 'no';
          dimmerSelect.disabled = true;
          dimmerHint.textContent = '* Optional Remote Dimming Control: $350 for Standard LED (Becker Only) / $200 for Maxi LED (Becker & Somfy)';
        }
        return;
      }

      if (dimmerLabel) dimmerLabel.textContent = 'Dimmer Option';
      const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';

      if (isGrandLouvre) {
        const opt = document.createElement('option');
        opt.value = 'included';
        opt.textContent = 'Dimmer Included (+$0)';
        dimmerSelect.appendChild(opt);
        dimmerSelect.value = 'included';
        dimmerSelect.disabled = true;
        dimmerHint.textContent = '* Grand Louvre includes Dimmer Option by default (+$0)';
      } else if (motorKey === 'becker') {
        [
          { value: 'no', label: 'No Dimmer (+$0)' },
          { value: 'yes', label: 'Include Dimmer (+$350)' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          dimmerSelect.appendChild(opt);
        });
        dimmerSelect.disabled = false;
        dimmerSelect.value = prevVal === 'yes' ? 'yes' : 'no';
        dimmerHint.textContent = '* Becker motor selected — Dimmer Option (+$350) is available';
      } else {
        const opt = document.createElement('option');
        opt.value = 'no';
        opt.textContent = 'N/A (Becker Exclusive)';
        dimmerSelect.appendChild(opt);
        dimmerSelect.value = 'no';
        dimmerSelect.disabled = true;
        dimmerHint.textContent = '* Dimmer Option (+$350) is only applicable when Becker motor is selected';
      }
    }

    function populateOperationOptions(resetMotorToDefault = false) {
      const opSelect = document.getElementById('operationSelect');
      const prevVal = opSelect.value;
      const product = getCurrentProduct();
      opSelect.innerHTML = '';

      if (activeCategory === 'LOUVRE') {
        const opt = document.createElement('option');
        opt.value = 'motorised';
        const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
        opt.textContent = isGrandLouvre ? 'Motorised (Somfy Included)' : 'Motorised (ACE Included)';
        opSelect.appendChild(opt);
        opSelect.value = 'motorised';
      } else if (activeCategory === 'OZTECH') {
        const opt = document.createElement('option');
        opt.value = 'motorised';
        opt.textContent = 'Motorised (Retractable Roof System)';
        opSelect.appendChild(opt);
        opSelect.value = 'motorised';
      } else if (activeCategory === 'DROP A') {
        const dropAOps = [{ value: 'manual', label: 'Manual Gear' }];
        if (product && product.springPrices) {
          dropAOps.push({ value: 'spring', label: 'Spring' });
        }
        const motorOpLabel = (product && product.motorisedPrices)
          ? 'Motorised (ACE Motor Included)'
          : 'Motorised';
        dropAOps.push({ value: 'motorised', label: motorOpLabel });

        dropAOps.forEach(optData => {
          const opt = document.createElement('option');
          opt.value = optData.value;
          opt.textContent = optData.label;
          opSelect.appendChild(opt);
        });
        const validVals = dropAOps.map(o => o.value);
        opSelect.value = validVals.includes(prevVal) ? prevVal : 'manual';
      } else {
        [
          { value: 'manual', label: 'Manual Gear (+$0)' },
          { value: 'motorised', label: 'Motorised' }
        ].forEach(optData => {
          const opt = document.createElement('option');
          opt.value = optData.value;
          opt.textContent = optData.label;
          opSelect.appendChild(opt);
        });
        opSelect.value = prevVal === 'motorised' ? 'motorised' : 'manual';
      }

      populateMotorOptions(resetMotorToDefault);
      document.getElementById('motorSelect').disabled = opSelect.value !== 'motorised';
      updateMotorButtonsUI();
    }

    function updateOztechGutterLedUI() {
      const cb = document.getElementById('oztechGutterLedCheck');
      const btnNone = document.getElementById('oztechGutterLedBtnNone');
      const btnYes = document.getElementById('oztechGutterLedBtnYes');
      const badge = document.getElementById('oztechGutterLedBadge');
      const subtext = document.getElementById('oztechGutterLedSubtext');
      const hint = document.getElementById('oztechGutterLedHint');
      const product = getCurrentProduct();
      const isExcluded = activeCategory === 'OZTECH' && isOztechGutterLedExcluded(product);

      if (cb) {
        if (isExcluded) {
          cb.checked = false;
          cb.disabled = true;
        } else {
          cb.disabled = false;
        }
      }
      const isChecked = Boolean(cb && cb.checked && !isExcluded);
      if (btnNone) {
        btnNone.classList.toggle('active-none', !isChecked);
      }
      if (btnYes) {
        btnYes.disabled = isExcluded;
        btnYes.classList.toggle('active', isChecked);
      }

      if (isExcluded) {
        if (badge) badge.textContent = 'Excluded (N/A)';
        if (subtext) subtext.textContent = `Excluded on ${product.name}`;
        if (hint) hint.textContent = '* Full Width LED Gutter is excluded on IZI, IZI SLOPE, MUSE and Cantilever Systems';
      } else {
        if (badge) badge.textContent = isChecked ? 'Gutter LED Added' : 'No Gutter LED';
        if (subtext) {
          subtext.textContent = isChecked
            ? 'Selected (+$674 ~ $907 by Width)'
            : 'Add Gutter LED (+$674 ~ $907 by Width)';
        }
        if (hint) {
          hint.textContent = '* Full Width LED Gutter ($674 ~ $907 by Width) • Excluding IZI, MUSE and Cantilever Systems';
        }
      }
    }

    function updateOztechMainLedUI() {
      const ledSelect = document.getElementById('ledSelect');
      const curVal = ledSelect ? ledSelect.value : 'none';
      document.querySelectorAll('#oztechMainLedTabs .oztech-main-led-btn').forEach(btn => {
        const bVal = btn.dataset.led;
        const isMatch = bVal === curVal;
        if (bVal === 'none') {
          btn.classList.toggle('active-none', isMatch);
          btn.classList.remove('active');
        } else {
          btn.classList.toggle('active', isMatch);
          btn.classList.remove('active-none');
        }
      });
    }

    function updateLouvreLedToggleUI(priceOverride = null) {
      const ledSelect = document.getElementById('ledSelect');
      const btn = document.getElementById('louvreLedToggleBtn');
      const titleEl = document.getElementById('louvreLedToggleTitle');
      const subEl = document.getElementById('louvreLedToggleSub');
      const badgeEl = document.getElementById('louvreLedToggleBadge');
      if (!btn) return;
      const isSelected = Boolean(ledSelect && ledSelect.value === 'louvre_led');
      const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
      btn.classList.toggle('active', isSelected);
      if (titleEl) {
        titleEl.textContent = isSelected
          ? `✓ Gutter LED Lighting${isGrandLouvre ? ' (Dimmer Included)' : ''}`
          : `Gutter LED Lighting${isGrandLouvre ? ' (Dimmer Included)' : ''}`;
      }
      if (subEl) {
        subEl.textContent = isSelected
          ? 'Gutter LED applied (Click again to cancel)'
          : 'Click to apply Gutter LED lighting';
      }
      if (badgeEl) {
        if (isSelected) {
          badgeEl.textContent = (priceOverride !== null && priceOverride > 0)
            ? `+$${formatMoney(priceOverride)}`
            : 'Applied';
        } else {
          badgeEl.textContent = 'Not Applied (+$0)';
        }
      }
    }

    function populateLedOptions() {
      const ledSelect = document.getElementById('ledSelect');
      const prevVal = ledSelect.value;
      const ledHint = document.getElementById('ledHint');
      const ledGroup = document.getElementById('ledGroup');
      const ledGroupLabel = document.getElementById('ledGroupLabel');
      const oztechMainLedTabs = document.getElementById('oztechMainLedTabs');
      const louvreLedToggleBtn = document.getElementById('louvreLedToggleBtn');
      const oztechGutterLedGroup = document.getElementById('oztechGutterLedGroup');
      ledSelect.innerHTML = '';

      if (activeCategory === 'LOUVRE') {
        if (ledGroup) ledGroup.style.gridColumn = '1 / -1';
        if (ledGroupLabel) ledGroupLabel.textContent = 'LED Lighting';
        ledSelect.style.display = 'none';
        if (oztechMainLedTabs) oztechMainLedTabs.style.display = 'none';
        if (louvreLedToggleBtn) louvreLedToggleBtn.style.display = 'flex';
        if (oztechGutterLedGroup) oztechGutterLedGroup.style.display = 'none';
        const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
        [
          { value: 'none', label: 'None (No LED)' },
          {
            value: 'louvre_led',
            label: isGrandLouvre ? 'Gutter LED (Dimmer Default Included)' : 'Gutter LED'
          }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          ledSelect.appendChild(opt);
        });
        ledSelect.value = prevVal === 'louvre_led' ? 'louvre_led' : 'none';
        if (ledHint) {
          ledHint.textContent = isGrandLouvre
            ? '* Gutter LED Price by Width & Projection • Somfy & Dimmer Default Included'
            : '* Gutter LED Price by Width & Projection • Dimmer Option (+$350) Available on Becker Motor Only';
        }
        updateLouvreLedToggleUI();
      } else if (activeCategory === 'OZTECH') {
        if (ledGroup) ledGroup.style.gridColumn = '1 / -1';
        if (ledGroupLabel) ledGroupLabel.textContent = 'Main LED Lighting';
        ledSelect.style.display = 'none';
        if (oztechMainLedTabs) oztechMainLedTabs.style.display = 'grid';
        if (louvreLedToggleBtn) louvreLedToggleBtn.style.display = 'none';
        if (oztechGutterLedGroup) oztechGutterLedGroup.style.display = 'block';
        [
          { value: 'none', label: 'None (No LED)' },
          { value: 'uniled', label: 'UNILED (Standard LED)' },
          { value: 'maxi_led', label: 'MAXI LED (Full Width)' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          ledSelect.appendChild(opt);
        });
        ledSelect.value = ['none', 'uniled', 'maxi_led'].includes(prevVal) ? prevVal : 'none';
        if (ledHint) {
          ledHint.textContent = '* Select Standard LED (UNILED) or MAXI LED (Width 3M~13M × Proj 3M~10M) • Gutter LED can be added below';
        }
        updateOztechMainLedUI();
        updateOztechGutterLedUI();
        populateDimmerOptions();
      } else {
        if (ledGroup) ledGroup.style.gridColumn = '';
        if (ledGroupLabel) ledGroupLabel.textContent = 'LED Lighting';
        ledSelect.style.display = 'block';
        if (oztechMainLedTabs) oztechMainLedTabs.style.display = 'none';
        if (louvreLedToggleBtn) louvreLedToggleBtn.style.display = 'none';
        if (oztechGutterLedGroup) oztechGutterLedGroup.style.display = 'none';
        [
          { value: 'none', label: 'None (No LED)' },
          { value: 'arm_led', label: 'ARM LED (≤ 3.1M)' },
          { value: 'maxi_led', label: 'Maxi LED' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.label;
          ledSelect.appendChild(opt);
        });
        ledSelect.value = ['none', 'arm_led', 'maxi_led'].includes(prevVal) ? prevVal : 'none';
        if (ledHint) ledHint.textContent = '* Requires Alpha, Becker, or Somfy motor';
      }
    }

    function populatePowderCoatOptions() {
      const pcSelect = document.getElementById('powderCoatSelect');
      const pcLabel = document.getElementById('powderCoatLabel');
      const pcHintBox = document.getElementById('powderCoatHintBox');
      const pcHint = document.getElementById('powderCoatHint');
      const oztechPcTypeGroup = document.getElementById('oztechPcTypeGroup');
      const prevVal = pcSelect.value;
      const product = getCurrentProduct();
      pcSelect.innerHTML = '';

      if (oztechPcTypeGroup) {
        oztechPcTypeGroup.style.display = activeCategory === 'OZTECH' ? 'block' : 'none';
      }

      if (activeCategory === 'OZTECH') {
        if (pcLabel) pcLabel.textContent = 'Powder Coat Finish';
        if (pcHintBox) pcHintBox.style.display = 'block';
        if (pcHint) pcHint.textContent = '* All Duralloy: +$0 • Duratec: Base System Price × 0.128';
        [
          { value: 'duralloy', text: 'All Duralloy (+$0)', tier: 'duralloy', label: 'All Duralloy' },
          { value: 'duratec', text: 'Duratec (+12.8%)', tier: 'duratec', label: 'Duratec (+12.8%)' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.text;
          opt.dataset.tier = item.tier;
          opt.dataset.label = item.label;
          pcSelect.appendChild(opt);
        });

        const validVals = Array.from(pcSelect.options).map(o => o.value);
        pcSelect.value = validVals.includes(prevVal) ? prevVal : 'duralloy';
      } else if (activeCategory === 'LOUVRE') {
        if (pcLabel) pcLabel.textContent = 'Powder Coat';
        if (pcHintBox) pcHintBox.style.display = 'none';
        [
          { value: 'duralloy', text: 'All Duralloy (+$0)', tier: 'duralloy', label: 'All Duralloy' },
          { value: 'duratec', text: 'Duratec (+1.28%)', tier: 'duratec', label: 'Duratec (+1.28%)' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.text;
          opt.dataset.tier = item.tier;
          opt.dataset.label = item.label;
          pcSelect.appendChild(opt);
        });

        const validVals = Array.from(pcSelect.options).map(o => o.value);
        pcSelect.value = validVals.includes(prevVal) ? prevVal : 'duralloy';
      } else if (activeCategory === 'DROP A' && product && product.standardColours) {
        if (pcLabel) pcLabel.textContent = 'Powder Coat';
        if (pcHintBox) pcHintBox.style.display = 'none';
        product.standardColours.forEach(colName => {
          const opt = document.createElement('option');
          opt.value = colName.toLowerCase().replace(/\s+/g, '_');
          opt.textContent = `${colName} (Standard - +$0)`;
          opt.dataset.tier = '';
          opt.dataset.label = `${colName} (Standard)`;
          pcSelect.appendChild(opt);
        });

        const nonStdOpt = document.createElement('option');
        nonStdOpt.value = 'non_standard';
        nonStdOpt.textContent = 'Non Standard Colour';
        nonStdOpt.dataset.tier = 'non_standard';
        nonStdOpt.dataset.label = 'Non Standard Colour';
        pcSelect.appendChild(nonStdOpt);

        const validVals = Array.from(pcSelect.options).map(o => o.value);
        pcSelect.value = validVals.includes(prevVal) ? prevVal : pcSelect.options[0].value;
      } else {
        if (pcLabel) pcLabel.textContent = 'Powder Coat';
        if (pcHintBox) pcHintBox.style.display = 'none';
        [
          { value: 'white', text: 'White (Standard - +$0)', tier: '', label: 'White (Standard)' },
          { value: 'black', text: 'Black', tier: 'standard', label: 'Black' },
          { value: 'charcoal', text: 'Charcoal', tier: 'standard', label: 'Charcoal' },
          { value: 'paperbark', text: 'Paperbark', tier: 'standard', label: 'Paperbark' },
          { value: 'apo_grey', text: 'APO Grey', tier: 'standard', label: 'APO Grey' },
          { value: 'woodland_grey', text: 'Woodland Grey', tier: 'standard', label: 'Woodland Grey' },
          { value: 'non_standard', text: 'Other Durolly (Non Standard)', tier: 'non_standard', label: 'Non Standard Colour' }
        ].forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.value;
          opt.textContent = item.text;
          opt.dataset.tier = item.tier;
          opt.dataset.label = item.label;
          pcSelect.appendChild(opt);
        });

        const validVals = Array.from(pcSelect.options).map(o => o.value);
        pcSelect.value = validVals.includes(prevVal) ? prevVal : 'white';
      }
    }

    function isCautionCell(product, w, p) {
      if (!product || !product.cautionRule) return false;
      return w >= product.cautionRule.minWidth || p >= product.cautionRule.minProjection;
    }

    function setDropASubModel(subKey, triggerChange = true) {
      const subSelect = document.getElementById('dropASubSelect');
      if (subSelect) subSelect.value = subKey;
      document.querySelectorAll('.dropa-sub-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subKey);
      });
      if (triggerChange && subSelect) {
        subSelect.dispatchEvent(new Event('change'));
      }
    }

    function populateDropASubModels() {
      const groupKey = document.getElementById('dropAGroupSelect').value;
      const subSelect = document.getElementById('dropASubSelect');
      const subTabs = document.getElementById('dropASubTabs');
      const items = DB.dropAModels[groupKey] || [];
      subSelect.innerHTML = '';
      if (subTabs) {
        subTabs.innerHTML = '';
        subTabs.style.gridTemplateColumns = `repeat(${Math.min(items.length || 1, 5)}, 1fr)`;
      }
      items.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = item.key;
        opt.textContent = item.name;
        subSelect.appendChild(opt);

        if (subTabs) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `sub-type-btn dropa-sub-btn${idx === 0 ? ' active' : ''}`;
          btn.dataset.sub = item.key;
          btn.innerHTML = `<span>${item.name}</span>`;
          btn.addEventListener('click', () => setDropASubModel(item.key, true));
          subTabs.appendChild(btn);
        }
      });
      subSelect.disabled = items.length <= 1;
    }

    function setOztechSubModel(subKey, triggerChange = true) {
      const subSelect = document.getElementById('oztechSubSelect');
      if (subSelect) subSelect.value = subKey;
      document.querySelectorAll('.oztech-sub-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subKey);
      });
      if (triggerChange && subSelect) {
        subSelect.dispatchEvent(new Event('change'));
      }
    }

    function populateOztechSubModels() {
      const groupKey = document.getElementById('oztechGroupSelect').value;
      const subSelect = document.getElementById('oztechSubSelect');
      const subTabs = document.getElementById('oztechSubTabs');
      const items = DB.oztechModels[groupKey] || [];
      subSelect.innerHTML = '';
      if (subTabs) {
        subTabs.innerHTML = '';
        subTabs.style.gridTemplateColumns = `repeat(${Math.min(items.length || 1, 4)}, 1fr)`;
      }
      items.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = item.key;
        opt.textContent = item.name;
        subSelect.appendChild(opt);

        if (subTabs) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `sub-type-btn oztech-sub-btn${idx === 0 ? ' active' : ''}`;
          btn.dataset.sub = item.key;
          btn.innerHTML = `<span>${item.name}</span>`;
          btn.addEventListener('click', () => setOztechSubModel(item.key, true));
          subTabs.appendChild(btn);
        }
      });
      subSelect.disabled = items.length <= 1;
      const hintEl = document.getElementById('oztechSubHint');
      if (hintEl) {
        if (groupKey === 'HARBOUR' || groupKey === 'HARBOUR+') {
          hintEl.textContent = `* ${groupKey}: Standard is Freestanding Type`;
        } else if (items.length === 1) {
          hintEl.textContent = `* ${groupKey}: Standard Only`;
        } else {
          hintEl.textContent = `* ${groupKey}: ${items.map(i => i.name).join(' / ')}`;
        }
      }
    }

    function updateOztechModuleHints() {
      const product = getCurrentProduct();
      const modSelect = document.getElementById('oztechModuleSelect');
      if (modSelect) {
        const modCfg = (product && product.moduleConfig) ? product.moduleConfig : DB.oztechModules;
        Array.from(modSelect.options).forEach(opt => {
          const m = modCfg[opt.value] || DB.oztechModules[opt.value];
          if (m) {
            opt.textContent = `${m.label} (${(m.minWidth / 1000).toFixed(0)}~${(m.maxWidth / 1000).toFixed(0)}M)`;
          }
        });
      }
      const modInfo = getCurrentOztechModuleInfo();
      const hasOverhang = Boolean(modInfo.overhangWidths && modInfo.overhangWidths.length > 0);
      const overhangCheck = document.getElementById('oztechOverhangCheck');
      if (overhangCheck) {
        if (!hasOverhang) {
          overhangCheck.checked = false;
          overhangCheck.disabled = true;
        } else {
          overhangCheck.disabled = false;
        }
      }
      const isOverhang = isOztechOverhangChecked();
      const overhangLabel = document.getElementById('oztechOverhangLabel');
      const overhangSubtext = document.getElementById('oztechOverhangSubtext');
      const overhangBadge = document.getElementById('oztechOverhangBadge');
      const moduleHint = document.getElementById('oztechModuleHint');
      const overhangHint = document.getElementById('oztechOverhangHint');

      if (overhangLabel) {
        overhangLabel.classList.toggle('checked', isOverhang);
      }
      if (!hasOverhang) {
        if (overhangSubtext) overhangSubtext.textContent = '(Not Applicable for PLAZA Type)';
        if (overhangBadge) overhangBadge.textContent = 'No Overhang';
        if (moduleHint) {
          moduleHint.textContent = `* ${modInfo.label}: ${modInfo.minWidth.toLocaleString()} ~ ${modInfo.maxWidth.toLocaleString()} mm (PLAZA Type — Standard Widths Only)`;
        }
        if (overhangHint) {
          overhangHint.textContent = `* PLAZA Type: Overhang is not applicable (${modInfo.minWidth.toLocaleString()} ~ ${modInfo.maxWidth.toLocaleString()} mm)`;
        }
        return;
      }
      const ohMinM = (modInfo.overhangWidths[0] / 1000).toFixed(1);
      const ohMaxM = (modInfo.overhangWidths[modInfo.overhangWidths.length - 1] / 1000).toFixed(1);
      if (overhangSubtext) {
        overhangSubtext.textContent = `(Up to ${modInfo.overhangMaxWidth.toLocaleString()} mm)`;
      }
      if (overhangBadge) {
        overhangBadge.textContent = `${ohMinM}M ~ ${ohMaxM}M`;
      }
      if (moduleHint) {
        moduleHint.textContent = `* ${modInfo.label}: ${modInfo.minWidth.toLocaleString()} ~ ${modInfo.maxWidth.toLocaleString()} mm (Overhang: up to ${modInfo.overhangMaxWidth.toLocaleString()} mm)`;
      }
      if (overhangHint) {
        overhangHint.textContent = isOverhang
          ? `* Overhang Active: Width up to ${modInfo.overhangMaxWidth.toLocaleString()} mm (${ohMinM}M ~ ${ohMaxM}M tiers enabled)`
          : `* Standard Width: ${modInfo.minWidth.toLocaleString()} ~ ${modInfo.maxWidth.toLocaleString()} mm (Check Overhang for ${ (modInfo.maxWidth + 1).toLocaleString() } ~ ${modInfo.overhangMaxWidth.toLocaleString()} mm)`;
      }
    }

    function parseHeightMeters(rawVal) {
      const v = parseFloat(rawVal);
      if (isNaN(v) || v <= 0) return 0;
      return v < 50 ? v : v / 1000;
    }

    function getDefaultOztechPostCount() {
      const groupKey = document.getElementById('oztechGroupSelect')?.value || 'IZI';
      const modKey = document.getElementById('oztechModuleSelect')?.value || 'single';
      const isHarbour = groupKey === 'HARBOUR' || groupKey === 'HARBOUR+';
      if (isHarbour) {
        if (modKey === 'double') return 6;
        if (modKey === 'triple') return 8;
        return 4;
      }
      if (modKey === 'double') return 3;
      if (modKey === 'triple') return 4;
      return 2;
    }

    function syncOztechDefaultPostQty() {
      const qtyInput = document.getElementById('oztechNoPostQty');
      if (qtyInput) {
        qtyInput.value = getDefaultOztechPostCount();
      }
      const hintEl = document.getElementById('oztechNoPostHint');
      if (hintEl) {
        const groupKey = document.getElementById('oztechGroupSelect')?.value || 'IZI';
        const isHarbour = groupKey === 'HARBOUR' || groupKey === 'HARBOUR+';
        const defaultCount = getDefaultOztechPostCount();
        hintEl.textContent = isHarbour
          ? `* ${groupKey} Default Posts: Single 4 / Double 6 / Triple 8 (Current Default: ${defaultCount} ea • Editable × -$80)`
          : `* Standard Default Posts: Single 2 / Double 3 / Triple 4 (Current Default: ${defaultCount} ea • Editable × -$80)`;
      }
    }

    let lastAutoLouvrePostCount = 4;

    function getDefaultLouvrePostCount(w, p) {
      const rawW = w !== undefined ? w : (parseFloat(document.getElementById('widthInput')?.value) || 0);
      const rawP = p !== undefined ? p : (parseFloat(document.getElementById('projInput')?.value) || 0);
      let count = 4;
      if (rawW > 5500) count += 2;
      if (rawP > 5500) count += 2;
      return Math.min(8, count);
    }

    function syncLouvreDefaultPostQty(forceSync = false) {
      const defaultCount = getDefaultLouvrePostCount();
      const qtyInput = document.getElementById('louvreNoPostQty');
      if (qtyInput) {
        if (forceSync || defaultCount !== lastAutoLouvrePostCount) {
          qtyInput.value = defaultCount;
          lastAutoLouvrePostCount = defaultCount;
        }
      }
      const hintEl = document.getElementById('louvreNoPostHint');
      if (hintEl) {
        hintEl.textContent = `* Default Posts: ${defaultCount} ea (Base 4, +2 if W > 5,500mm, +2 if P > 5,500mm • Max 8 • Editable × -$80)`;
      }
    }

    function formatHeaderUnit(val) {
      const mVal = val / 1000;
      const mStr = Number.isInteger(mVal * 10) ? mVal.toFixed(1) : mVal.toFixed(2);
      return `${val} (${mStr}M)`;
    }

    function formatMoney(val) {
      const rounded = Math.round((Number(val) + Number.EPSILON) * 100) / 100;
      return Number.isInteger(rounded)
        ? rounded.toLocaleString()
        : rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function populateFabricOptions(resetToDefault = false) {
      const fabricSelect = document.getElementById('fabricSelect');
      if (!fabricSelect) return;
      const prevVal = fabricSelect.value;
      fabricSelect.innerHTML = '';

      if (activeCategory === 'OZTECH') {
        const categories = ['Translucent', 'Blockout'];
        const validKeys = [];
        categories.forEach(cat => {
          const group = document.createElement('optgroup');
          group.label = cat;
          Object.entries(DB.oztechFabrics)
            .filter(([, f]) => f.category === cat)
            .forEach(([fKey, fData]) => {
              validKeys.push(fKey);
              const opt = document.createElement('option');
              opt.value = fKey;
              opt.textContent = `${fData.name} (${fData.fabricWidth}mm • $${fData.rate}/sqm)`;
              group.appendChild(opt);
            });
          if (group.children.length > 0) fabricSelect.appendChild(group);
        });
        fabricSelect.value = (!resetToDefault && validKeys.includes(prevVal))
          ? prevVal
          : (validKeys.includes('oz_solscape') ? 'oz_solscape' : (validKeys[0] || ''));
      } else {
        const categories = activeCategory === 'DROP A'
          ? ['Shade Mesh', 'Clear PVC']
          : ['Acrylic', 'Canvas', 'Clear PVC', 'Shade Mesh'];
        const validKeys = [];
        categories.forEach(cat => {
          const group = document.createElement('optgroup');
          group.label = cat;
          Object.entries(DB.fabrics)
            .filter(([, f]) => f.category === cat)
            .forEach(([fKey, fData]) => {
              validKeys.push(fKey);
              const opt = document.createElement('option');
              opt.value = fKey;
              opt.textContent = `${fData.name} ($${fData.rate}/sqm)`;
              group.appendChild(opt);
            });
          if (group.children.length > 0) fabricSelect.appendChild(group);
        });
        const defaultFabricKey = activeCategory === 'DROP A' ? 'ds_95' : 'solscape';
        fabricSelect.value = (!resetToDefault && validKeys.includes(prevVal))
          ? prevVal
          : (validKeys.includes(defaultFabricKey) ? defaultFabricKey : (validKeys[0] || ''));
      }
    }

    // Handle 4 Category Buttons (FAA / DROP A / OZTECH / LOUVRE)
    function setCategory(catKey) {
      activeCategory = catKey;
      const catInfo = DB.categories[catKey];

      document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === catKey);
      });

      document.getElementById('activeCategoryHeaderBadge').textContent = `Active Lineup: ${catInfo.label}`;

      const calcForm = document.getElementById('calcForm');
      const comingSoonSection = document.getElementById('comingSoonSection');
      const refTablesCard = document.getElementById('refTablesCard');
      const faaModelSection = document.getElementById('faaModelSection');
      const dropAModelSection = document.getElementById('dropAModelSection');
      const louvreModelSection = document.getElementById('louvreModelSection');
      const oztechModelSection = document.getElementById('oztechModelSection');

      if (catInfo.ready) {
        calcForm.style.display = 'block';
        comingSoonSection.style.display = 'none';
        refTablesCard.style.display = 'block';

        if (catKey === 'DROP A') {
          faaModelSection.style.display = 'none';
          dropAModelSection.style.display = 'block';
          louvreModelSection.style.display = 'none';
          if (oztechModelSection) oztechModelSection.style.display = 'none';
          document.getElementById('widthInput').value = 2400;
          document.getElementById('projInput').value = 2000;
        } else if (catKey === 'LOUVRE') {
          faaModelSection.style.display = 'none';
          dropAModelSection.style.display = 'none';
          louvreModelSection.style.display = 'block';
          if (oztechModelSection) oztechModelSection.style.display = 'none';
          document.getElementById('widthInput').value = 3000;
          document.getElementById('projInput').value = 3000;
          syncLouvreDefaultPostQty(true);
        } else if (catKey === 'OZTECH') {
          faaModelSection.style.display = 'none';
          dropAModelSection.style.display = 'none';
          louvreModelSection.style.display = 'none';
          if (oztechModelSection) oztechModelSection.style.display = 'block';
          populateOztechSubModels();
          updateOztechModuleHints();
          syncOztechDefaultPostQty();
          document.getElementById('widthInput').value = 3500;
          document.getElementById('projInput').value = 4000;
        } else {
          faaModelSection.style.display = 'block';
          dropAModelSection.style.display = 'none';
          louvreModelSection.style.display = 'none';
          if (oztechModelSection) oztechModelSection.style.display = 'none';
          const curW = parseFloat(document.getElementById('widthInput').value);
          if (curW === 2400 || curW === 3000 || curW === 3500) {
            document.getElementById('widthInput').value = 3800;
          }
          document.getElementById('projSelect').value = '2600';
        }

        populateFabricOptions();
        populateOperationOptions(true);
        populateLedOptions();
        populateDimmerOptions();
        populatePowderCoatOptions();
        renderBracketOptions();
        renderBracketReference();
        renderFabricReference();
        renderSensorOptions();
        updateInputHints();
        renderTable();
        calculatePrice(false);
      } else {
        calcForm.style.display = 'none';
        comingSoonSection.style.display = 'block';
        refTablesCard.style.display = 'none';
        document.getElementById('comingSoonTitle').textContent = `${catKey} Lineup Configuration`;
        document.getElementById('comingSoonDesc').textContent =
          `The ${catInfo.label} calculator module is ready to be built. Share the price tables and options for ${catKey} to activate this tab.`;

        const resultBox = document.getElementById('resultBox');
        resultBox.className = 'result-box';
        document.getElementById('resultProductTag').textContent = catInfo.label;
        document.getElementById('resultLabel').textContent = 'Awaiting Price Table Setup';
        document.getElementById('resultPrice').textContent = 'Coming Soon';
        document.getElementById('specChips').style.display = 'none';
        document.getElementById('cautionBanner').style.display = 'none';
        document.getElementById('breakdownBox').style.display = 'none';
        const resultBadge = document.getElementById('resultBadge');
        resultBadge.style.display = 'block';
        resultBadge.textContent = `Select "FAA", "DROP A", "OZTECH", or "LOUVRE" above to calculate prices.`;
      }
    }

    // Filter Wall Mount Bracket ($20) vs Millennium Wall Mount Bracket ($48) by product series
    function updateBracketVisibilityByProduct() {
      const isMillennium = getCurrentProductKey() === 'millennium';

      const stdWallRow = document.getElementById('brk-row-wall_mount_bracket');
      const stdWallCb = document.getElementById('brk-cb-wall_mount_bracket');
      const stdWallQty = document.getElementById('qty-wall_mount_bracket');
      const stdWallSub = document.getElementById('sub-wall_mount_bracket');
      const stdWallRefTr = document.getElementById('tr-brk-wall_mount_bracket');

      const milWallRow = document.getElementById('brk-row-millennium_wall_bracket');
      const milWallCb = document.getElementById('brk-cb-millennium_wall_bracket');
      const milWallQty = document.getElementById('qty-millennium_wall_bracket');
      const milWallSub = document.getElementById('sub-millennium_wall_bracket');
      const milWallRefTr = document.getElementById('tr-brk-millennium_wall_bracket');

      if (isMillennium) {
        if (stdWallRow) {
          stdWallRow.style.display = 'none';
          stdWallRow.classList.remove('checked');
        }
        if (stdWallCb) stdWallCb.checked = false;
        if (stdWallQty) {
          stdWallQty.disabled = true;
          stdWallQty.value = 1;
        }
        if (stdWallSub) stdWallSub.textContent = '+$20';
        if (stdWallRefTr) stdWallRefTr.style.display = 'none';

        if (milWallRow) milWallRow.style.display = 'flex';
        if (milWallRefTr) milWallRefTr.style.display = '';
      } else {
        if (stdWallRow) stdWallRow.style.display = 'flex';
        if (stdWallRefTr) stdWallRefTr.style.display = '';

        if (milWallRow) {
          milWallRow.style.display = 'none';
          milWallRow.classList.remove('checked');
        }
        if (milWallCb) milWallCb.checked = false;
        if (milWallQty) {
          milWallQty.disabled = true;
          milWallQty.value = 1;
        }
        if (milWallSub) milWallSub.textContent = '+$48';
        if (milWallRefTr) milWallRefTr.style.display = 'none';
      }
    }

    function updateInputHints() {
      const product = getCurrentProduct();
      const supplyType = getCurrentSupplyType();
      const widths = getActiveWidths(product, supplyType);
      const maxW = widths[widths.length - 1];
      const maxP = (activeCategory === 'LOUVRE' && product.bladeRanges)
        ? product.bladeRanges[product.bladeRanges.length - 1].max
        : product.projections[product.projections.length - 1];

      const louvreModuleRow = document.getElementById('louvreModuleRow');
      if (louvreModuleRow) {
        louvreModuleRow.style.display = activeCategory === 'LOUVRE' ? 'grid' : 'none';
        if (activeCategory === 'LOUVRE') {
          syncLouvreDefaultPostQty(false);
        }
      }

      const oztechModuleRow = document.getElementById('oztechModuleRow');
      const oztechHeightRow = document.getElementById('oztechHeightRow');
      const oztechFrontHeightLabel = document.getElementById('oztechFrontHeightLabel');
      const oztechBackHeightGroup = document.getElementById('oztechBackHeightGroup');
      const oztechPostGutterRow = document.getElementById('oztechPostGutterRow');
      const onsiteAssemblyGroup = document.getElementById('onsiteAssemblyGroup');
      if (activeCategory === 'OZTECH') {
        if (oztechModuleRow) oztechModuleRow.style.display = 'grid';
        if (oztechHeightRow) {
          oztechHeightRow.style.display = 'grid';
          const isIziSlope = product && product.group === 'IZI SLOPE';
          oztechHeightRow.style.gridTemplateColumns = isIziSlope ? '1fr' : '';
          if (oztechFrontHeightLabel) {
            oztechFrontHeightLabel.textContent = isIziSlope
              ? 'Height'
              : 'Front Height';
          }
          if (oztechBackHeightGroup) {
            oztechBackHeightGroup.style.display = isIziSlope ? 'none' : 'block';
          }
        }
        if (oztechPostGutterRow) oztechPostGutterRow.style.display = 'grid';
        if (onsiteAssemblyGroup) onsiteAssemblyGroup.style.display = 'block';
        updateOztechModuleHints();
        const modInfo = getCurrentOztechModuleInfo();
        const isOverhang = isOztechOverhangChecked();
        document.getElementById('widthInput').min = 2000;
        document.getElementById('widthInput').max = 15000;
        document.getElementById('widthHint').textContent = isOverhang
          ? `* ${modInfo.label} + Overhang: ${modInfo.minWidth.toLocaleString()} ~ ${modInfo.overhangMaxWidth.toLocaleString()} mm (Auto-switches Module by Width)`
          : `* ${modInfo.label}: ${modInfo.minWidth.toLocaleString()} ~ ${modInfo.maxWidth.toLocaleString()} mm (Auto-switches 1/2/3 Bay by Width)`;
      } else {
        if (oztechModuleRow) oztechModuleRow.style.display = 'none';
        if (oztechHeightRow) oztechHeightRow.style.display = 'none';
        if (oztechPostGutterRow) oztechPostGutterRow.style.display = 'none';
        if (onsiteAssemblyGroup) onsiteAssemblyGroup.style.display = 'none';
        document.getElementById('widthInput').min = 100;
        document.getElementById('widthInput').max = maxW;
        document.getElementById('widthHint').textContent = `* Max ${maxW.toLocaleString()} mm (Rounds up)`;
      }
      document.getElementById('projInput').max = maxP;

      const projSelect = document.getElementById('projSelect');
      const projInputWrapper = document.getElementById('projInputWrapper');
      if (activeCategory === 'FAA') {
        projSelect.style.display = 'block';
        projInputWrapper.style.display = 'none';
        document.getElementById('projHint').textContent = `* Fixed Projection (Max ${maxP.toLocaleString()} mm)`;
      } else if (activeCategory === 'LOUVRE' && product.bladeRanges) {
        projSelect.style.display = 'none';
        projInputWrapper.style.display = 'block';
        const minBladeP = product.bladeRanges[0].min;
        const maxBladeP = product.bladeRanges[product.bladeRanges.length - 1].max;
        document.getElementById('projHint').textContent = `* Blade Range: ${minBladeP.toLocaleString()} ~ ${maxBladeP.toLocaleString()} mm (Specific blade spans only)`;
      } else if (activeCategory === 'OZTECH') {
        projSelect.style.display = 'none';
        projInputWrapper.style.display = 'block';
        const isPlaza = Boolean(product.isPlaza || (product.subType === 'PLAZA'));
        const ozMaxInputProj = isPlaza ? 20000 : 10000;
        document.getElementById('projInput').max = ozMaxInputProj;
        document.getElementById('projHint').textContent = isPlaza
          ? `* Direct Input — Max ${ozMaxInputProj.toLocaleString()} mm (PLAZA Type • Rounds up)`
          : `* Direct Input — Table Max ${maxP.toLocaleString()} mm / Input Max ${ozMaxInputProj.toLocaleString()} mm (Rounds up)`;
      } else {
        projSelect.style.display = 'none';
        projInputWrapper.style.display = 'block';
        document.getElementById('projHint').textContent = `* Max ${maxP.toLocaleString()} mm (Rounds up)`;
      }

      // Toggle Fabric vs Louvre Blade vs OZTECH Specification state
      const fabricSelect = document.getElementById('fabricSelect');
      const sqmDisplay = document.getElementById('sqmDisplay');
      const fabricRateHint = document.getElementById('fabricRateHint');
      const step1TitleText = document.getElementById('step1TitleText');
      const sqmFieldLabel = document.getElementById('sqmFieldLabel');
      const chipAreaLabel = document.getElementById('chipAreaLabel');

      if (activeCategory === 'LOUVRE') {
        fabricSelect.disabled = true;
        sqmDisplay.classList.remove('kit-disabled-display');
        step1TitleText.textContent = 'Dimensions & Blades';
        sqmFieldLabel.textContent = 'Blade & Post Spec';
        chipAreaLabel.textContent = 'Blades / Posts';
        fabricRateHint.textContent = '* Aluminum Louvre Blades (No Fabric Surcharge)';
      } else if (activeCategory === 'OZTECH') {
        fabricSelect.disabled = false;
        sqmDisplay.classList.remove('kit-disabled-display');
        step1TitleText.textContent = 'Dimensions & Fabric';
        sqmFieldLabel.textContent = 'Fabric Area';
        chipAreaLabel.textContent = 'Module / Area';
        fabricRateHint.textContent = '* Surcharge = System Size (Width × Projection) × Fabric Rate ($/sqm)';
      } else if (supplyType === 'kit') {
        fabricSelect.disabled = true;
        sqmDisplay.classList.add('kit-disabled-display');
        step1TitleText.textContent = 'Dimensions & Fabric';
        sqmFieldLabel.textContent = 'Fabric Area';
        chipAreaLabel.textContent = 'Fabric Area';
        fabricRateHint.textContent = '* KIT Only excludes Fabric (+$0)';
      } else {
        fabricSelect.disabled = false;
        sqmDisplay.classList.remove('kit-disabled-display');
        step1TitleText.textContent = 'Dimensions & Fabric';
        sqmFieldLabel.textContent = 'Fabric Area';
        chipAreaLabel.textContent = 'Fabric Area';
        fabricRateHint.textContent = '* Surcharge = Area (sqm) × Fabric Rate';
      }

      // Toggle Fabric Tray Option visibility (only for Family - Complete)
      const fabricTrayGroup = document.getElementById('fabricTrayGroup');
      if (product.fabricTray) {
        fabricTrayGroup.style.display = 'block';
      } else {
        fabricTrayGroup.style.display = 'none';
        document.getElementById('fabricTraySelect').value = 'no';
      }

      // Toggle LED Lighting Option visibility (Not applicable to DROP A)
      const ledGroup = document.getElementById('ledGroup');
      const oztechGutterLedGroup = document.getElementById('oztechGutterLedGroup');
      const step3TitleText = document.getElementById('step3TitleText');
      if (activeCategory === 'DROP A') {
        ledGroup.style.display = 'none';
        if (oztechGutterLedGroup) oztechGutterLedGroup.style.display = 'none';
        document.getElementById('ledSelect').value = 'none';
        step3TitleText.textContent = 'Frame Finish';
      } else {
        ledGroup.style.display = 'block';
        if (oztechGutterLedGroup) {
          oztechGutterLedGroup.style.display = activeCategory === 'OZTECH' ? 'block' : 'none';
        }
        step3TitleText.textContent = 'Frame Finish & Lighting';
      }

      if (activeCategory === 'FAA') {
        updateBracketVisibilityByProduct();
      }
    }

    // Render Sensor & Remote Checkboxes based on Operation & Motor Brand
    function renderSensorOptions() {
      const product = getCurrentProduct();
      const operation = document.getElementById('operationSelect').value;
      const motorKey = document.getElementById('motorSelect').value;
      const sensorBox = document.getElementById('sensorBox');
      const sensorGroupLabel = document.getElementById('sensorGroupLabel');

      if (operation !== 'motorised') {
        sensorGroupLabel.textContent = 'Sensor & Remote';
        sensorBox.innerHTML = '<div class="sensor-disabled-msg">Select "Motorised" to choose Sensor & Remote.</div>';
        return;
      }

      const activeMotors = getActiveMotors(product);
      const motorName = (activeMotors && activeMotors[motorKey])
        ? activeMotors[motorKey].name
        : (DB.motors[motorKey]?.name || motorKey.toUpperCase());
      const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
      sensorGroupLabel.textContent = activeCategory === 'LOUVRE'
        ? (isGrandLouvre ? 'Rain Sensor (Somfy)' : `Sensor & Remote (${motorName})`)
        : `Sensor & Remote (${motorName})`;

      let options = [];
      if (product && product.sensorAndRemotes) {
        options = product.sensorAndRemotes;
      } else {
        options = [...(DB.sensorAndRemotes[motorKey] || [])];
        if (product && product.excludeMotionSensors) {
          options = options.filter(item => !item.id.endsWith('_motion'));
        }
      }
      const grid = document.createElement('div');
      grid.className = 'checkbox-grid';

      options.forEach(item => {
        const isDefaultChecked = Boolean(item.defaultChecked);
        const isLocked = Boolean(item.locked);
        const priceLabel = (item.price === 0 && isDefaultChecked)
          ? 'Included (+$0)'
          : `+$${item.price.toLocaleString()}`;
        const label = document.createElement('label');
        label.className = 'checkbox-item' + (isDefaultChecked ? ' checked' : '');
        label.innerHTML = `
          <span class="checkbox-left">
            <input type="checkbox" class="sensor-checkbox" value="${item.id}" data-name="${item.name}" data-price="${item.price}" ${isDefaultChecked ? 'checked' : ''} ${isLocked ? 'disabled' : ''}>
            <span>${item.name}</span>
          </span>
          <span class="checkbox-price">${priceLabel}</span>
        `;

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', function() {
          label.classList.toggle('checked', this.checked);
          calculatePrice(false);
        });

        grid.appendChild(label);
      });

      sensorBox.innerHTML = '';
      sensorBox.appendChild(grid);
    }

    // Render Brackets & Extras Checkboxes with Quantity Input
    function renderBracketOptions() {
      const product = getCurrentProduct();
      const activeBrackets = getActiveBrackets(product);
      const bracketConfigSection = document.getElementById('bracketConfigSection');
      const bracketBox = document.getElementById('bracketBox');

      if (!activeBrackets || activeBrackets.length === 0) {
        bracketConfigSection.style.display = 'none';
        bracketBox.innerHTML = '';
        return;
      }

      bracketConfigSection.style.display = 'block';
      const grid = document.createElement('div');
      grid.className = 'checkbox-grid';

      activeBrackets.forEach(item => {
        const unitLabel = item.unit || 'ea';
        const row = document.createElement('div');
        row.className = 'checkbox-item bracket-item';
        row.id = `brk-row-${item.id}`;
        row.innerHTML = `
          <label class="checkbox-left" style="margin-bottom:0; cursor:pointer;">
            <input type="checkbox" class="bracket-checkbox" id="brk-cb-${item.id}" value="${item.id}" data-name="${item.name}" data-price="${item.price}">
            <span>${item.name} <span style="color:var(--text-muted); font-weight:500;">($${item.price}/${unitLabel})</span></span>
          </label>
          <div class="checkbox-right">
            <div class="qty-wrapper">
              <span>Qty:</span>
              <input type="number" class="qty-input" id="qty-${item.id}" min="1" max="99" value="1" disabled>
            </div>
            <span class="checkbox-price" id="sub-${item.id}">+$${item.price.toLocaleString()}</span>
          </div>
        `;

        const checkbox = row.querySelector('.bracket-checkbox');
        const qtyInput = row.querySelector('.qty-input');
        const subtotalEl = row.querySelector('.checkbox-price');

        function updateRowState() {
          const isChecked = checkbox.checked;
          row.classList.toggle('checked', isChecked);
          qtyInput.disabled = !isChecked;
          let qty = parseInt(qtyInput.value, 10);
          if (isNaN(qty) || qty < 1) {
            qty = 1;
          }
          const sub = item.price * qty;
          subtotalEl.textContent = isChecked ? `+$${sub.toLocaleString()}` : `+$${item.price.toLocaleString()}`;
          calculatePrice(false);
        }

        checkbox.addEventListener('change', updateRowState);
        qtyInput.addEventListener('input', updateRowState);

        grid.appendChild(row);
      });

      bracketBox.innerHTML = '';
      bracketBox.appendChild(grid);
      if (activeCategory === 'FAA') {
        updateBracketVisibilityByProduct();
      }
    }

    // Render Reference Table (Base [Complete or KIT] + Fabric Tray + Motor + Powder Coat + LED Lighting)
    function renderTable() {
      const product = getCurrentProduct();
      const supplyType = getCurrentSupplyType();
      const operation = document.getElementById('operationSelect').value;
      const ozModInfo = activeCategory === 'OZTECH' ? getCurrentOztechModuleInfo() : null;
      const supplyBadge = activeCategory === 'OZTECH'
        ? ozModInfo.label
        : (activeCategory === 'LOUVRE'
            ? (product.moduleType || 'Single Module')
            : (activeCategory === 'DROP A'
                ? (operation === 'spring'
                    ? 'Spring'
                    : (operation === 'motorised' && product.motorisedPrices
                        ? 'ACE Obstacle Detection Motor'
                        : 'Manual Gear'))
                : (supplyType === 'kit' ? 'KIT Price' : 'Complete Price')));
      const widths = getActiveWidths(product, supplyType);
      const priceMatrix = getActivePriceMatrix(product, supplyType);
      const hasPostCol = Boolean(product && product.postCounts);
      const totalCols = widths.length + 1 + (hasPostCol ? 1 : 0);

      const headerRow = document.getElementById('tableHeader');
      const tbody = document.getElementById('tableBody');
      const tableTitle = document.getElementById('tableTitle');
      const mainTableSubtitle = document.getElementById('mainTableSubtitle');

      tableTitle.textContent = `📊 ${activeCategory} — ${product.name} (${supplyBadge}) & Options Reference Price Tables`;
      mainTableSubtitle.textContent = activeCategory === 'DROP A'
        ? `${product.name} — ${supplyBadge} Price Table`
        : (activeCategory === 'LOUVRE'
            ? `${product.name} — ${supplyBadge} System Price Table`
            : (activeCategory === 'OZTECH'
                ? `${product.name} — ${supplyBadge} Price Table (Width & Overhang)`
                : `${product.name} — ${supplyBadge} Table, Motor, Powder Coat & LED`));
      headerRow.innerHTML = hasPostCol
        ? '<th>Projection \\ Width</th><th>No. post</th>'
        : '<th>Projection \\ Width</th>';
      tbody.innerHTML = '';

      widths.forEach(w => {
        const th = document.createElement('th');
        th.id = `th-w-${w}`;
        if (activeCategory === 'OZTECH' && ozModInfo && ozModInfo.overhangWidths.includes(w)) {
          th.innerHTML = `${formatHeaderUnit(w)}<br><span style="font-size:0.65rem; color:#fde68a; font-weight:700;">OVERHANG</span>`;
        } else {
          th.textContent = formatHeaderUnit(w);
        }
        headerRow.appendChild(th);
      });

      // 1. Product Projection Rows
      if (!priceMatrix) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = totalCols;
        td.style.padding = '1.25rem';
        td.style.color = 'var(--danger)';
        td.style.fontWeight = '700';
        td.textContent = supplyType === 'kit'
          ? `KIT Price Table for ${product.name} is pending upload.`
          : `Price Table for ${product.name} (${supplyBadge}) is pending upload.`;
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        product.projections.forEach(p => {
          const tr = document.createElement('tr');
          tr.id = `tr-p-${p}`;

          const rowHeader = document.createElement('th');
          rowHeader.textContent = formatHeaderUnit(p);
          tr.appendChild(rowHeader);

          if (hasPostCol) {
            const postTd = document.createElement('td');
            postTd.style.fontWeight = '700';
            postTd.style.color = 'var(--primary)';
            postTd.textContent = product.postCounts[p] || '-';
            tr.appendChild(postTd);
          }

          widths.forEach(w => {
            const td = document.createElement('td');
            td.id = `cell-${p}-${w}`;
            const price = priceMatrix[p][w];
            if (price === 0) {
              td.textContent = 'N/A (0)';
              td.classList.add('zero-cell');
            } else {
              td.textContent = '$' + price.toLocaleString();
              if (isCautionCell(product, w, p)) {
                td.classList.add('caution-cell');
              }
            }
            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });
      }

      // 1-B. Fabric Tray Row (If applicable to product, e.g. Family - Complete)
      if (product.fabricTray) {
        const trayDividerTr = document.createElement('tr');
        trayDividerTr.className = 'section-divider';
        const trayDividerTh = document.createElement('th');
        trayDividerTh.colSpan = totalCols;
        trayDividerTh.textContent = '🛡️ Fabric Tray Option (Family - Complete Exclusive)';
        trayDividerTr.appendChild(trayDividerTh);
        tbody.appendChild(trayDividerTr);

        const tr = document.createElement('tr');
        tr.id = 'tr-tray';

        const rowHeader = document.createElement('th');
        rowHeader.textContent = 'Fabric Tray';
        tr.appendChild(rowHeader);

        widths.forEach((w, idx) => {
          const td = document.createElement('td');
          td.id = `cell-tray-${w}`;
          const tPrice = product.fabricTray[idx];
          td.textContent = '+$' + tPrice.toLocaleString();
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      }

      // 2. Section Divider for Motors (By Width Tier)
      const activeMotors = getActiveMotors(product);
      if (activeMotors) {
        const motorDividerTr = document.createElement('tr');
        motorDividerTr.className = 'section-divider';
        const motorDividerTh = document.createElement('th');
        motorDividerTh.colSpan = totalCols;
        motorDividerTh.textContent = '⚡ Motorised Additional Cost (By Width Tier)';
        motorDividerTr.appendChild(motorDividerTh);
        tbody.appendChild(motorDividerTr);

        Object.entries(activeMotors).forEach(([motorKey, motorData]) => {
          const tr = document.createElement('tr');
          tr.id = `tr-m-${motorKey}`;

          const rowHeader = document.createElement('th');
          rowHeader.innerHTML = `${motorData.name} <span class="motor-star">★</span>`;
          tr.appendChild(rowHeader);

          if (hasPostCol) {
            const emptyPostTd = document.createElement('td');
            emptyPostTd.textContent = '-';
            tr.appendChild(emptyPostTd);
          }

          widths.forEach((w, idx) => {
            const td = document.createElement('td');
            td.id = `cell-m-${motorKey}-${w}`;
            const mPrice = motorData.prices[idx];
            td.textContent = (mPrice === 0 && (product.motorisedPrices || activeCategory === 'LOUVRE')) ? 'Included (+$0)' : '+$' + mPrice.toLocaleString();
            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });
      }

      // 3. Section Divider for Powder Coat (if defined for this product)
      if (product.powderCoatRule) {
        const pcDividerTr = document.createElement('tr');
        pcDividerTr.className = 'section-divider';
        const pcDividerTh = document.createElement('th');
        pcDividerTh.colSpan = totalCols;
        pcDividerTh.textContent = '🎨 Powder Coat Finish (All Duralloy Included • Duratec: Base × 0.0128)';
        pcDividerTr.appendChild(pcDividerTh);
        tbody.appendChild(pcDividerTr);

        [
          { key: 'duralloy', name: 'All Duralloy Colours', desc: 'Included (+$0)' },
          { key: 'duratec', name: 'Duratec Finish', desc: 'Base System Price × 0.0128 (+1.28%)' }
        ].forEach(item => {
          const tr = document.createElement('tr');
          tr.id = `tr-pc-${item.key}`;
          const rowHeader = document.createElement('th');
          rowHeader.style.fontSize = '0.76rem';
          rowHeader.textContent = item.name;
          tr.appendChild(rowHeader);

          const td = document.createElement('td');
          td.id = `cell-pc-${item.key}`;
          td.colSpan = totalCols - 1;
          td.style.fontWeight = '700';
          td.textContent = item.desc;
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
      } else if (product.powderCoat) {
        const pcDividerTr = document.createElement('tr');
        pcDividerTr.className = 'section-divider';
        const pcDividerTh = document.createElement('th');
        pcDividerTh.colSpan = totalCols;
        pcDividerTh.textContent = product.standardColours
          ? `🎨 Powder Coat Additional Cost (Standard [${product.standardColours.join(', ')}]: +$0)`
          : '🎨 Powder Coat Additional Cost (White: +$0)';
        pcDividerTr.appendChild(pcDividerTh);
        tbody.appendChild(pcDividerTr);

        Object.entries(product.powderCoat).forEach(([pcTierKey, pcTierData]) => {
          const tr = document.createElement('tr');
          tr.id = `tr-pc-${pcTierKey}`;

          const rowHeader = document.createElement('th');
          rowHeader.style.fontSize = '0.76rem';
          rowHeader.textContent = pcTierData.name;
          tr.appendChild(rowHeader);

          if (hasPostCol) {
            const emptyPostTd = document.createElement('td');
            emptyPostTd.textContent = '-';
            tr.appendChild(emptyPostTd);
          }

          widths.forEach((w, idx) => {
            const td = document.createElement('td');
            td.id = `cell-pc-${pcTierKey}-${w}`;
            const pcPrice = pcTierData.prices[idx];
            td.textContent = '+$' + pcPrice.toLocaleString();
            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });
      }

      // 4. Section Divider for LED Lighting (FAA or LOUVRE Gutter LED)
      if (activeCategory === 'LOUVRE' && product.ledPrices) {
        const ledDividerTr = document.createElement('tr');
        ledDividerTr.className = 'section-divider';
        const ledDividerTh = document.createElement('th');
        ledDividerTh.colSpan = totalCols;
        const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
        ledDividerTh.textContent = isGrandLouvre
          ? '💡 Gutter LED Price Table (By Projection & Width • Dimmer Default Included)'
          : '💡 Gutter LED Price Table (By Projection & Width • Becker Dimmer Option +$350)';
        ledDividerTr.appendChild(ledDividerTh);
        tbody.appendChild(ledDividerTr);

        const ledProjs = product.ledProjections || Object.keys(product.ledPrices).map(Number);
        ledProjs.forEach(lp => {
          const tr = document.createElement('tr');
          tr.id = `tr-louvre-led-${lp}`;

          const rowHeader = document.createElement('th');
          rowHeader.style.fontSize = '0.76rem';
          rowHeader.textContent = `Gutter LED — ${formatHeaderUnit(lp)}`;
          tr.appendChild(rowHeader);

          if (hasPostCol) {
            const emptyPostTd = document.createElement('td');
            emptyPostTd.textContent = '-';
            tr.appendChild(emptyPostTd);
          }

          widths.forEach(w => {
            const td = document.createElement('td');
            td.id = `cell-louvre-led-${lp}-${w}`;
            const lPrice = getLouvreLedPrice(product, lp, w) || 0;
            if (lPrice === 0) {
              td.textContent = 'N/A';
              td.classList.add('na-cell');
            } else {
              td.textContent = '+$' + lPrice.toLocaleString();
            }
            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });
      } else if (activeCategory === 'FAA') {
        const ledDividerTr = document.createElement('tr');
        ledDividerTr.className = 'section-divider';
        const ledDividerTh = document.createElement('th');
        ledDividerTh.colSpan = totalCols;
        ledDividerTh.textContent = '💡 LED Lighting Additional Cost (By Motor Brand • ACE Not Applicable)';
        ledDividerTr.appendChild(ledDividerTh);
        tbody.appendChild(ledDividerTr);

        Object.entries(DB.ledLighting).forEach(([ledKey, ledData]) => {
          Object.entries(ledData.rows).forEach(([motorKey, rowData]) => {
            const tr = document.createElement('tr');
            tr.id = `tr-led-${ledKey}-${motorKey}`;

            const rowHeader = document.createElement('th');
            rowHeader.style.fontSize = '0.76rem';
            rowHeader.textContent = rowData.label;
            tr.appendChild(rowHeader);

            widths.forEach((w, idx) => {
              const td = document.createElement('td');
              td.id = `cell-led-${ledKey}-${motorKey}-${w}`;
              const lPrice = rowData.prices[idx];
              if (lPrice === 0) {
                td.textContent = 'N/A';
                td.classList.add('na-cell');
              } else {
                td.textContent = '+$' + lPrice.toLocaleString();
              }
              tr.appendChild(td);
            });

            tbody.appendChild(tr);
          });
        });
      }

      renderBladeRangeReference(product);
      renderOztechFullPcReference();
      renderOztechLedReference();
    }

    // Render OZTECH Full Powder Coating Price Reference Table
    function renderOztechFullPcReference() {
      const subcard = document.getElementById('oztechFullPcRefSubcard');
      const headerRow = document.getElementById('oztechFullPcTableHeader');
      const tbody = document.getElementById('oztechFullPcTableBody');
      if (!subcard || !headerRow || !tbody) return;

      if (activeCategory !== 'OZTECH') {
        subcard.style.display = 'none';
        return;
      }

      subcard.style.display = 'block';
      const pcDb = DB.oztechFullPowderCoat;
      headerRow.innerHTML = '<th>Projection \\ Width</th>';
      tbody.innerHTML = '';

      pcDb.widths.forEach(w => {
        const th = document.createElement('th');
        th.id = `th-ozpc-w-${w}`;
        th.textContent = formatHeaderUnit(w);
        headerRow.appendChild(th);
      });

      pcDb.projections.forEach(p => {
        const tr = document.createElement('tr');
        tr.id = `tr-ozpc-p-${p}`;
        const rowHeader = document.createElement('th');
        rowHeader.textContent = formatHeaderUnit(p);
        tr.appendChild(rowHeader);

        pcDb.widths.forEach(w => {
          const td = document.createElement('td');
          td.id = `cell-ozpc-${p}-${w}`;
          const price = pcDb.prices[p][w];
          td.textContent = '+$' + price.toLocaleString();
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    // Render OZTECH LED Lighting Reference Tables (Standard LED / Maxi Full Width LED / Full Width LED Gutter)
    function renderOztechLedReference() {
      const subcard = document.getElementById('oztechLedRefSubcard');
      const container = document.getElementById('oztechLedRefContainer');
      if (!subcard || !container) return;

      if (activeCategory !== 'OZTECH') {
        subcard.style.display = 'none';
        return;
      }

      subcard.style.display = 'block';
      const ledDb = DB.oztechLedLighting;
      container.innerHTML = '';

      const sections = [
        {
          key: 'uniled',
          title: '※ Standard LED MIDDLE BAR (UNILED) — ON-OFF Control • Optional Dimmer: +$350 (Becker Only)',
          prices: ledDb.uniled.prices
        },
        {
          key: 'maxi_led',
          title: '※ MAXI (FULL WIDTH) LED MIDDLE BAR — ON-OFF Control • Optional Dimmer: +$200 (Becker & Somfy)',
          prices: ledDb.maxi_led.prices
        }
      ];

      sections.forEach(sec => {
        const tbl = document.createElement('table');
        tbl.style.marginBottom = '0.85rem';
        const thead = document.createElement('thead');
        const titleTr = document.createElement('tr');
        titleTr.className = 'section-divider';
        const titleTh = document.createElement('th');
        titleTh.colSpan = ledDb.widths.length + 1;
        titleTh.textContent = sec.title;
        titleTr.appendChild(titleTh);
        thead.appendChild(titleTr);

        const hTr = document.createElement('tr');
        hTr.innerHTML = '<th>Projection \\ Width</th>';
        ledDb.widths.forEach(w => {
          const th = document.createElement('th');
          th.id = `th-ozled-${sec.key}-w-${w}`;
          th.textContent = formatHeaderUnit(w);
          hTr.appendChild(th);
        });
        thead.appendChild(hTr);
        tbl.appendChild(thead);

        const tbody = document.createElement('tbody');
        ledDb.projections.forEach(p => {
          const tr = document.createElement('tr');
          tr.id = `tr-ozled-${sec.key}-p-${p}`;
          const rowHeader = document.createElement('th');
          rowHeader.textContent = formatHeaderUnit(p);
          tr.appendChild(rowHeader);

          ledDb.widths.forEach(w => {
            const td = document.createElement('td');
            td.id = `cell-ozled-${sec.key}-${p}-${w}`;
            const val = sec.prices[p]?.[w] || 0;
            if (val === 0) {
              td.textContent = 'N/A';
              td.classList.add('na-cell');
            } else {
              td.textContent = '+$' + val.toLocaleString();
            }
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        container.appendChild(tbl);
      });

      // Full Width LED Gutter Table
      const gTbl = document.createElement('table');
      const gThead = document.createElement('thead');
      const gTitleTr = document.createElement('tr');
      gTitleTr.className = 'section-divider';
      const gTitleTh = document.createElement('th');
      gTitleTh.colSpan = ledDb.widths.length + 1;
      gTitleTh.textContent = '※ FULL WIDTH LED GUTTER (EXCLUDING IZI, MUSE AND CANTILEVER SYSTEMS)';
      gTitleTr.appendChild(gTitleTh);
      gThead.appendChild(gTitleTr);

      const gHeaderTr = document.createElement('tr');
      gHeaderTr.innerHTML = '<th>Option \\ Width</th>';
      ledDb.widths.forEach(w => {
        const th = document.createElement('th');
        th.id = `th-ozled-gutter-w-${w}`;
        th.textContent = formatHeaderUnit(w);
        gHeaderTr.appendChild(th);
      });
      gThead.appendChild(gHeaderTr);
      gTbl.appendChild(gThead);

      const gTbody = document.createElement('tbody');
      const gTr = document.createElement('tr');
      gTr.id = 'tr-ozled-gutter';
      const gRowHeader = document.createElement('th');
      gRowHeader.textContent = 'Full Width LED Gutter';
      gTr.appendChild(gRowHeader);
      ledDb.widths.forEach(w => {
        const td = document.createElement('td');
        td.id = `cell-ozled-gutter-${w}`;
        const val = ledDb.gutter_led.pricesByWidth[w] || 0;
        td.textContent = '+$' + val.toLocaleString();
        gTr.appendChild(td);
      });
      gTbody.appendChild(gTr);
      gTbl.appendChild(gTbody);
      container.appendChild(gTbl);
    }

    // Render Louvre Buildable Blade Projection Ranges Reference Table
    function renderBladeRangeReference(product) {
      const subcard = document.getElementById('bladeRangeRefSubcard');
      const titleEl = document.getElementById('bladeRangeRefTitle');
      const tbody = document.getElementById('bladeRangeTableBody');
      if (!subcard || !tbody) return;

      if (!product || !product.bladeRanges) {
        subcard.style.display = 'none';
        tbody.innerHTML = '';
        return;
      }

      const minB = product.bladeRanges[0].blades;
      const maxB = product.bladeRanges[product.bladeRanges.length - 1].blades;
      if (titleEl) {
        titleEl.textContent = `📏 ${product.name} — Buildable Blade Projection Ranges (${minB} ~ ${maxB} Blades)`;
      }
      subcard.style.display = 'block';
      tbody.innerHTML = '';
      product.bladeRanges.forEach(b => {
        const tr = document.createElement('tr');
        tr.id = `tr-blade-${b.blades}`;
        tr.innerHTML = `
          <th>${b.blades} Blades</th>
          <td>${b.min.toLocaleString()}</td>
          <td>${b.max.toLocaleString()}</td>
          <td style="font-weight:700;">${b.min.toLocaleString()} ~ ${b.max.toLocaleString()} mm</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Render Brackets & Extras Reference Grid
    function renderBracketReference() {
      const product = getCurrentProduct();
      const activeBrackets = getActiveBrackets(product);
      const bracketRefSubcard = document.getElementById('bracketRefSubcard');
      const grid = document.getElementById('bracketRefGrid');
      grid.innerHTML = '';

      if (!activeBrackets || activeBrackets.length === 0) {
        bracketRefSubcard.style.display = 'none';
        return;
      }

      bracketRefSubcard.style.display = 'block';

      if (activeCategory === 'FAA') {
        const leftItems = DB.bracketsAndExtras.slice(0, 6);
        const rightItems = DB.bracketsAndExtras.slice(6);

        [
          { title: "Mounting Brackets", items: leftItems },
          { title: "Support Poles, Handles, Printing & Special Brackets", items: rightItems }
        ].forEach(group => {
          const tbl = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML = `<tr><th colspan="2">${group.title}</th></tr>`;
          tbl.appendChild(thead);

          const tbody = document.createElement('tbody');
          group.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.id = `tr-brk-${item.id}`;
            tr.innerHTML = `<td style="text-align:left; padding-left:0.75rem;">${item.name}</td><td>+$${item.price} Extra</td>`;
            tbody.appendChild(tr);
          });
          tbl.appendChild(tbody);
          grid.appendChild(tbl);
        });

        updateBracketVisibilityByProduct();
      } else if (activeCategory === 'OZTECH') {
        const tbl = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th colspan="2">OZTECH Additional Rafter Brackets & Sets</th></tr>`;
        tbl.appendChild(thead);

        const tbody = document.createElement('tbody');
        activeBrackets.forEach(item => {
          const tr = document.createElement('tr');
          tr.id = `tr-brk-${item.id}`;
          tr.innerHTML = `<td style="text-align:left; padding-left:0.75rem;">${item.name}</td><td>+$${item.price} Extra</td>`;
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        grid.appendChild(tbl);
      } else {
        const tbl = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th>PART NAME</th><th>Unit</th><th>UNIT PRICE</th></tr>`;
        tbl.appendChild(thead);

        const tbody = document.createElement('tbody');
        activeBrackets.forEach(item => {
          const tr = document.createElement('tr');
          tr.id = `tr-brk-${item.id}`;
          tr.innerHTML = `<td style="text-align:left; padding-left:0.75rem;">${item.name}</td><td>${item.unit || 'Set'}</td><td>+$${item.price.toFixed(2)}</td>`;
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        grid.appendChild(tbl);
      }
    }

    // Render Sensor & Remote Reference Grid
    function renderSensorReference() {
      const grid = document.getElementById('sensorRefGrid');
      grid.innerHTML = '';

      Object.entries(DB.sensorAndRemotes).forEach(([motorKey, items]) => {
        const motorName = DB.motors[motorKey].name;
        const tbl = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th colspan="2">${motorName} Motor</th></tr>`;
        tbl.appendChild(thead);

        const tbody = document.createElement('tbody');
        items.forEach(item => {
          const tr = document.createElement('tr');
          tr.id = `tr-sen-${item.id}`;
          tr.innerHTML = `<td style="text-align:left; padding-left:0.65rem;">${item.name}</td><td>+$${item.price}</td>`;
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        grid.appendChild(tbl);
      });
    }

    // Render Fabric Reference Grid at the bottom
    function renderFabricReference() {
      const grid = document.getElementById('fabricRefGrid');
      grid.innerHTML = '';

      if (activeCategory === 'OZTECH') {
        grid.className = 'ref-grid-2';
        const categories = ["Translucent", "Blockout"];
        categories.forEach(cat => {
          const tbl = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML = `<tr><th colspan="3">${cat} (OZTECH Roofing Systems)</th></tr><tr><th>Fabric Name</th><th>Fabric Width</th><th>Add-on Cost</th></tr>`;
          tbl.appendChild(thead);

          const tbody = document.createElement('tbody');
          Object.entries(DB.oztechFabrics)
            .filter(([, f]) => f.category === cat)
            .forEach(([fKey, fData]) => {
              const tr = document.createElement('tr');
              tr.id = `tr-fab-${fKey}`;
              tr.innerHTML = `<td style="text-align:left; padding-left:0.75rem;">${fData.name}</td><td>${fData.fabricWidth} mm</td><td>$${fData.rate}/sqm</td>`;
              tbody.appendChild(tr);
            });
          tbl.appendChild(tbody);
          grid.appendChild(tbl);
        });
      } else {
        const categories = activeCategory === 'DROP A'
          ? ["Shade Mesh", "Clear PVC"]
          : ["Acrylic", "Canvas", "Clear PVC", "Shade Mesh"];
        grid.className = activeCategory === 'DROP A' ? 'ref-grid-2' : 'ref-grid-4';
        categories.forEach(cat => {
          const tbl = document.createElement('table');
          const thead = document.createElement('thead');
          thead.innerHTML = `<tr><th colspan="2">${cat}</th></tr>`;
          tbl.appendChild(thead);

          const tbody = document.createElement('tbody');
          Object.entries(DB.fabrics)
            .filter(([, f]) => f.category === cat)
            .forEach(([fKey, fData]) => {
              const tr = document.createElement('tr');
              tr.id = `tr-fab-${fKey}`;
              tr.innerHTML = `<td>${fData.name}</td><td>$${fData.rate}/sqm</td>`;
              tbody.appendChild(tr);
            });
          tbl.appendChild(tbody);
          grid.appendChild(tbl);
        });
      }
    }

    function clearHighlights() {
      document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell'));
      document.querySelectorAll('.selected-motor-cell').forEach(el => el.classList.remove('selected-motor-cell'));
      document.querySelectorAll('.selected-pc-cell').forEach(el => el.classList.remove('selected-pc-cell'));
      document.querySelectorAll('.selected-led-cell').forEach(el => el.classList.remove('selected-led-cell'));
      document.querySelectorAll('.selected-tray-cell').forEach(el => el.classList.remove('selected-tray-cell'));
      document.querySelectorAll('.selected-row').forEach(el => el.classList.remove('selected-row'));
      document.querySelectorAll('.selected-motor-row').forEach(el => el.classList.remove('selected-motor-row'));
      document.querySelectorAll('.selected-pc-row').forEach(el => el.classList.remove('selected-pc-row'));
      document.querySelectorAll('.selected-led-row').forEach(el => el.classList.remove('selected-led-row'));
      document.querySelectorAll('.selected-tray-row').forEach(el => el.classList.remove('selected-tray-row'));
      document.querySelectorAll('.selected-col').forEach(el => el.classList.remove('selected-col'));
      document.querySelectorAll('.fabric-item-selected').forEach(el => el.classList.remove('fabric-item-selected'));
      document.querySelectorAll('.sensor-item-selected').forEach(el => el.classList.remove('sensor-item-selected'));
      document.querySelectorAll('.bracket-item-selected').forEach(el => el.classList.remove('bracket-item-selected'));
    }

    function setErrorState(title, priceMsg, badgeMsg, showAlert, alertMsg) {
      const resultBox = document.getElementById('resultBox');
      const resultLabel = document.getElementById('resultLabel');
      const resultPrice = document.getElementById('resultPrice');
      const breakdownBox = document.getElementById('breakdownBox');
      const resultBadge = document.getElementById('resultBadge');
      const cautionBanner = document.getElementById('cautionBanner');

      resultBox.className = 'result-box error';
      resultLabel.textContent = title;
      resultPrice.textContent = priceMsg;
      cautionBanner.style.display = 'none';
      breakdownBox.style.display = 'none';
      resultBadge.style.display = 'block';
      resultBadge.textContent = badgeMsg;
      document.getElementById('discountPreviewDisplay').value = '-';
      document.getElementById('discountFormulaHint').textContent = '* Applies discount to Base System Price only';
      if (showAlert && alertMsg) {
        alert(alertMsg);
      }
    }

    function calculatePrice(showAlert = true) {
      if (activeCategory !== 'FAA' && activeCategory !== 'DROP A' && activeCategory !== 'LOUVRE' && activeCategory !== 'OZTECH') return;

      clearHighlights();

      const product = getCurrentProduct();
      const supplyType = getCurrentSupplyType();
      const isKit = supplyType === 'kit';
      const widths = getActiveWidths(product, supplyType);
      const priceMatrix = getActivePriceMatrix(product, supplyType);
      const ozModInfo = activeCategory === 'OZTECH' ? getCurrentOztechModuleInfo() : null;
      const isOverhangChecked = activeCategory === 'OZTECH' ? isOztechOverhangChecked() : false;

      const maxW = widths[widths.length - 1];
      const maxP = product.projections[product.projections.length - 1];

      const rawWidth = parseFloat(document.getElementById('widthInput').value);
      const rawProj = activeCategory === 'FAA'
        ? parseFloat(document.getElementById('projSelect').value)
        : parseFloat(document.getElementById('projInput').value);
      const rawDiscountVal = parseFloat(document.getElementById('discountInput').value);
      const discountRate = isNaN(rawDiscountVal) ? 0 : Math.max(0, Math.min(100, rawDiscountVal));
      const fabricKey = document.getElementById('fabricSelect').value;
      const activeFabrics = activeCategory === 'OZTECH' ? DB.oztechFabrics : DB.fabrics;
      const fabricObj = activeFabrics[fabricKey] || Object.values(activeFabrics)[0];
      const operation = document.getElementById('operationSelect').value;
      const motorKey = document.getElementById('motorSelect').value;
      const pcSelectEl = document.getElementById('powderCoatSelect');
      const pcKey = pcSelectEl.value;
      const pcSelectedOpt = pcSelectEl.options[pcSelectEl.selectedIndex];
      const pcOption = {
        tier: pcSelectedOpt?.dataset.tier || (DB.powderCoatOptions[pcKey]?.tier ?? null),
        label: pcSelectedOpt?.dataset.label || (DB.powderCoatOptions[pcKey]?.label ?? 'Standard')
      };
      const ledKey = document.getElementById('ledSelect').value;
      const fabricTrayVal = document.getElementById('fabricTraySelect').value;

      const resultBox = document.getElementById('resultBox');
      const resultProductTag = document.getElementById('resultProductTag');
      const resultLabel = document.getElementById('resultLabel');
      const resultPrice = document.getElementById('resultPrice');
      const specChips = document.getElementById('specChips');
      const cautionBanner = document.getElementById('cautionBanner');
      const breakdownBox = document.getElementById('breakdownBox');
      const basePriceLabelText = document.getElementById('basePriceLabelText');
      const basePriceText = document.getElementById('basePriceText');
      const fabricLabelText = document.getElementById('fabricLabelText');
      const fabricPriceText = document.getElementById('fabricPriceText');
      const motorLabelText = document.getElementById('motorLabelText');
      const motorPriceText = document.getElementById('motorPriceText');
      const sensorLabelText = document.getElementById('sensorLabelText');
      const sensorPriceText = document.getElementById('sensorPriceText');
      const pcLabelText = document.getElementById('pcLabelText');
      const pcPriceText = document.getElementById('pcPriceText');
      const ledLabelText = document.getElementById('ledLabelText');
      const ledPriceText = document.getElementById('ledPriceText');
      const trayBreakdownRow = document.getElementById('trayBreakdownRow');
      const trayLabelText = document.getElementById('trayLabelText');
      const trayPriceText = document.getElementById('trayPriceText');
      const bracketLabelText = document.getElementById('bracketLabelText');
      const bracketPriceText = document.getElementById('bracketPriceText');
      const resultBadge = document.getElementById('resultBadge');

      cautionBanner.style.display = 'none';

      if (isNaN(rawWidth) || isNaN(rawProj) || rawWidth <= 0 || rawProj <= 0) {
        renderNearestProjSuggestions(null, 0, null);
        document.getElementById('sqmDisplay').value = '-';
        if (showAlert) alert('Please enter valid positive numbers for Width and Projection.');
        return;
      }

      // Ceiling match: find the smallest standard tier >= user input
      const widthIndex = widths.findIndex(w => w >= rawWidth);
      const matchedWidth = widthIndex !== -1 ? widths[widthIndex] : null;
      const bladeCheck = getLouvreBladeMatch(product, rawProj);
      const matchedProj = product.projections.find(p => p >= rawProj) ||
        ((bladeCheck && bladeCheck.valid) ? product.projections[product.projections.length - 1] : null);
      renderNearestProjSuggestions(bladeCheck, rawProj, product);
      const postCount = activeCategory === 'LOUVRE'
        ? getDefaultLouvrePostCount(rawWidth, rawProj)
        : ((product.postCounts && matchedProj) ? product.postCounts[matchedProj] : null);
      const louvreModType = getLouvreModuleType(product, matchedWidth);
      const isOzOverhangTier = Boolean(ozModInfo && matchedWidth && ozModInfo.overhangWidths.includes(matchedWidth));

      const supplyLabel = activeCategory === 'OZTECH'
        ? `${ozModInfo.label}${isOzOverhangTier ? ' • OVERHANG' : ''}`
        : (activeCategory === 'LOUVRE'
            ? louvreModType.toUpperCase()
            : (activeCategory === 'DROP A'
                ? (operation === 'spring' ? 'SPRING' : (operation === 'motorised' ? 'MOTORISED' : 'MANUAL GEAR'))
                : (isKit ? 'KIT ONLY' : 'COMPLETE')));
      resultProductTag.textContent = `${activeCategory} • ${product.name} (${supplyLabel})`;

      // Calculate Sqm & Fabric Surcharge (or Louvre Blade/Post Spec or OZTECH Module Spec)
      const widthM = rawWidth / 1000;
      const projM = rawProj / 1000;
      const sqm = widthM * projM;
      const fabricCost = (isKit || activeCategory === 'LOUVRE')
        ? 0
        : Math.round((sqm * fabricObj.rate + Number.EPSILON) * 100) / 100;

      if (activeCategory === 'LOUVRE') {
        const louvreModuleDisplay = document.getElementById('louvreModuleDisplay');
        if (bladeCheck && bladeCheck.valid) {
          const b = bladeCheck.match;
          const structStr = postCount ? `${postCount} Posts` : louvreModType;
          const shortMod = louvreModType.replace(' Module', '');
          document.getElementById('sqmDisplay').value = `${b.blades} Blades • ${structStr}`;
          document.getElementById('sqmFormulaHint').textContent = `* Valid Blade Span: ${b.blades} Blades (${b.min.toLocaleString()} ~ ${b.max.toLocaleString()} mm)`;
          if (louvreModuleDisplay) {
            louvreModuleDisplay.value = postCount
              ? `${shortMod} • ${postCount} Posts • ${b.blades}B`
              : `${shortMod} • ${b.blades} Blades`;
          }
          document.getElementById(`tr-blade-${b.blades}`)?.classList.add('selected-row');
        } else if (bladeCheck && !bladeCheck.valid) {
          const lowStr = bladeCheck.lower ? `${bladeCheck.lower.blades}B (${bladeCheck.lower.min}~${bladeCheck.lower.max})` : null;
          const upStr = bladeCheck.upper ? `${bladeCheck.upper.blades}B (${bladeCheck.upper.min}~${bladeCheck.upper.max})` : null;
          const nearHint = [lowStr, upStr].filter(Boolean).join(' or ');
          document.getElementById('sqmDisplay').value = `Invalid Span (${rawProj} mm)`;
          document.getElementById('sqmFormulaHint').textContent = `* Nearest Valid: ${nearHint}`;
          if (louvreModuleDisplay) {
            louvreModuleDisplay.value = `Invalid (${rawProj} mm)`;
          }
        } else {
          document.getElementById('sqmDisplay').value = `${louvreModType} (${sqm.toFixed(2)} sqm)`;
          document.getElementById('sqmFormulaHint').textContent = `* Width (${widthM.toFixed(2)}M) × Projection (${projM.toFixed(2)}M)`;
        }
      } else if (activeCategory === 'OZTECH') {
        document.getElementById(`tr-fab-${fabricKey}`)?.classList.add('fabric-item-selected');
        document.getElementById('sqmDisplay').value = `${sqm.toFixed(2)} sqm (+$${formatMoney(fabricCost)})`;
        document.getElementById('sqmFormulaHint').textContent = `* Width (${widthM.toFixed(2)}M) × Projection (${projM.toFixed(2)}M) = ${sqm.toFixed(2)} sqm × $${fabricObj.rate}/sqm (${fabricObj.category} • ${fabricObj.fabricWidth}mm)`;
      } else if (isKit) {
        document.getElementById('sqmDisplay').value = `KIT Only (${sqm.toFixed(2)} sqm • +$0)`;
        document.getElementById('sqmFormulaHint').textContent = `* KIT Supply: Hardware Only (No Fabric Surcharge)`;
      } else {
        document.getElementById(`tr-fab-${fabricKey}`)?.classList.add('fabric-item-selected');
        document.getElementById('sqmDisplay').value = `${sqm.toFixed(2)} sqm (+$${formatMoney(fabricCost)})`;
        document.getElementById('sqmFormulaHint').textContent = `* Width (${widthM.toFixed(2)}M) × Projection (${projM.toFixed(2)}M) = ${sqm.toFixed(2)} sqm × $${fabricObj.rate}/sqm`;
      }

      document.getElementById('widthTierPill').textContent = matchedWidth
        ? `Tier: ${matchedWidth.toLocaleString()} mm${isOzOverhangTier ? ' (Overhang)' : ''}`
        : 'Out of Range';
      document.getElementById('projTierPill').textContent = (bladeCheck && !bladeCheck.valid)
        ? 'Unbuildable Span'
        : (matchedProj ? `Tier: ${matchedProj.toLocaleString()} mm` : 'Out of Range');

      specChips.style.display = 'grid';
      document.getElementById('chipInputSize').textContent = `${rawWidth} × ${rawProj} mm`;
      document.getElementById('chipTierSize').textContent = (matchedWidth && matchedProj) ? `${matchedWidth} × ${matchedProj} mm` : 'Out of Range';
      if (activeCategory === 'LOUVRE') {
        document.getElementById('chipAreaSqm').textContent = (bladeCheck && bladeCheck.valid)
          ? (postCount ? `${bladeCheck.match.blades} Blades / ${postCount} Posts` : `${bladeCheck.match.blades} Blades (${louvreModType})`)
          : 'Invalid Span';
      } else if (activeCategory === 'OZTECH') {
        document.getElementById('chipAreaSqm').textContent = `${ozModInfo.label.split(' ')[0]} (${sqm.toFixed(1)} sqm)`;
      } else {
        document.getElementById('chipAreaSqm').textContent = isKit ? 'N/A (KIT)' : `${sqm.toFixed(2)} sqm`;
      }

      // Check if price table is pending upload for this model
      if (!priceMatrix) {
        const pendingTitle = activeCategory === 'OZTECH'
          ? `${ozModInfo.label} Price Table Pending Upload`
          : (isKit ? 'KIT Price Table Pending Upload' : 'Price Table Pending Upload');
        setErrorState(
          pendingTitle,
          'Pending Price Data',
          `Please upload the price table for ${product.name}${activeCategory === 'OZTECH' ? ' (' + ozModInfo.label + ')' : ''}`,
          showAlert,
          `ℹ️ Notice: The price table for ${product.name}${activeCategory === 'OZTECH' ? ' (' + ozModInfo.label + ')' : ''} has not been uploaded yet.`
        );
        return;
      }

      // Validate OZTECH Width & Overhang Rules per Module
      if (activeCategory === 'OZTECH' && ozModInfo) {
        if (rawWidth < ozModInfo.minWidth) {
          setErrorState(
            `Width Below ${ozModInfo.label} Minimum (${ozModInfo.minWidth.toLocaleString()} mm)`,
            'Below Min Width',
            `${ozModInfo.label} Valid Width: ${ozModInfo.minWidth.toLocaleString()} ~ ${ozModInfo.maxWidth.toLocaleString()} mm (Overhang up to ${ozModInfo.overhangMaxWidth.toLocaleString()} mm)`,
            showAlert,
            `⚠️ Warning: ${ozModInfo.label} requires a minimum width of ${ozModInfo.minWidth.toLocaleString()} mm. You entered ${rawWidth.toLocaleString()} mm.`
          );
          return;
        }
        if (rawWidth > ozModInfo.maxWidth && rawWidth <= ozModInfo.overhangMaxWidth && !isOverhangChecked) {
          setErrorState(
            `Overhang Option Required for Width > ${ozModInfo.maxWidth.toLocaleString()} mm`,
            'Check Overhang Option',
            `Check "Apply Overhang" in Step 0 to enable ${ (ozModInfo.maxWidth + 1).toLocaleString() } ~ ${ozModInfo.overhangMaxWidth.toLocaleString()} mm for ${ozModInfo.label}`,
            showAlert,
            `⚠️ Warning: Width ${rawWidth.toLocaleString()} mm exceeds the standard ${ozModInfo.label} limit (${ozModInfo.maxWidth.toLocaleString()} mm). Please check "Apply Overhang" in Step 0 (up to ${ozModInfo.overhangMaxWidth.toLocaleString()} mm) or select the next module.`
          );
          return;
        }
      }

      // Validate Grand Louvre / LouvreFlex Buildable Blade Projection Ranges
      if (bladeCheck && !bladeCheck.valid) {
        setErrorState(
          'Unbuildable Projection — Select Nearest Valid Size Below',
          'Select Valid Projection',
          `Entered ${rawProj.toLocaleString()} mm cannot be built • Click a nearest projection option above`,
          false,
          null
        );
        return;
      }

      // 1. Check max dimensions
      if (!matchedWidth || !matchedProj) {
        setErrorState(
          'Out of Range (Unavailable)',
          'Not Available',
          `Max Dimensions for ${product.name}: Width ${maxW.toLocaleString()} mm / Projection ${maxP.toLocaleString()} mm`,
          showAlert,
          `⚠️ Warning: The entered dimensions (${rawWidth} mm × ${rawProj} mm) exceed the maximum available size (${maxW.toLocaleString()} mm × ${maxP.toLocaleString()} mm) for ${product.name}.`
        );
        return;
      }

      const basePrice = priceMatrix[matchedProj][matchedWidth];

      // Highlight matched base row, column, and cell
      document.getElementById(`th-w-${matchedWidth}`)?.classList.add('selected-col');
      document.getElementById(`tr-p-${matchedProj}`)?.classList.add('selected-row');
      document.getElementById(`cell-${matchedProj}-${matchedWidth}`)?.classList.add('selected-cell');

      // 2. Check Base Price == 0 (Unavailable configuration)
      if (basePrice === 0) {
        setErrorState(
          'Unavailable Product Configuration',
          'Not Available (0)',
          `Applied Tier: Width ${matchedWidth} mm × Projection ${matchedProj} mm`,
          showAlert,
          `⚠️ Warning: This configuration (Width ${rawWidth}→${matchedWidth} mm, Projection ${rawProj}→${matchedProj} mm) is not available for ${product.name}.`
        );
        return;
      }

      // Show Caution Banner only when in Manual/Spring mode and matched cell is in shaded caution zone (e.g., GENIUS - ZIP: Width >= 4.2M or Drop 3.0M)
      if ((operation === 'manual' || operation === 'spring') && isCautionCell(product, matchedWidth, matchedProj)) {
        cautionBanner.textContent = product.cautionRule.message;
        cautionBanner.style.display = 'block';
      }

      const dropAOpLabel = operation === 'spring'
        ? 'Spring'
        : (operation === 'motorised' && product.motorisedPrices
            ? 'Motorised - ACE Obstacle Detection Motor'
            : 'Manual Gear');
      const louvreBaseSpec = postCount ? `${louvreModType} • ${postCount} Posts` : louvreModType;
      basePriceLabelText.textContent = activeCategory === 'OZTECH'
        ? `Base System Price (${product.name} • ${ozModInfo.label}${isOzOverhangTier ? ' [Overhang]' : ''})`
        : (activeCategory === 'LOUVRE'
            ? `Base System Price (${product.name} • ${louvreBaseSpec})`
            : (activeCategory === 'DROP A'
                ? `Base System Price (${product.name} - ${dropAOpLabel})`
                : (isKit ? 'Base System Price (KIT Only)' : 'Base System Price (Complete)')));

      // 2-A. Calculate Discount on Base System Price (Manual % + OZTECH On-Site Fabric Assembly 7% Discount)
      const isOnsiteAssembly = activeCategory === 'OZTECH' && Boolean(document.getElementById('onsiteAssemblyCheck')?.checked);
      const onsiteDiscountRate = isOnsiteAssembly ? 7 : 0;
      const totalDiscountRate = Math.min(100, Math.round((discountRate + onsiteDiscountRate) * 100) / 100);
      const manualDiscountAmount = Math.round((basePrice * (discountRate / 100) + Number.EPSILON) * 100) / 100;
      const onsiteDiscountAmount = isOnsiteAssembly
        ? Math.round((basePrice * 0.07 + Number.EPSILON) * 100) / 100
        : 0;
      const discountAmount = Math.min(basePrice, Math.round((manualDiscountAmount + onsiteDiscountAmount + Number.EPSILON) * 100) / 100);
      const netBasePrice = Math.round((basePrice - discountAmount + Number.EPSILON) * 100) / 100;

      const onsiteBadgeEl = document.getElementById('onsiteAssemblyBadge');
      if (onsiteBadgeEl) {
        onsiteBadgeEl.textContent = isOnsiteAssembly
          ? `-7% (-$${formatMoney(onsiteDiscountAmount)})`
          : '0%';
      }

      const discountParts = [];
      if (discountRate > 0) {
        discountParts.push(`${discountRate}%`);
      }
      if (isOnsiteAssembly) {
        discountParts.push(`On-Site -7%`);
      }

      document.getElementById('discountPreviewDisplay').value = `-$${formatMoney(discountAmount)} (Net: $${formatMoney(netBasePrice)})`;
      document.getElementById('discountFormulaHint').textContent = discountParts.length > 0
        ? `* Base ($${basePrice.toLocaleString()}) × ${totalDiscountRate}% [${discountParts.join(' + ')}] = -$${formatMoney(discountAmount)}`
        : `* Base ($${basePrice.toLocaleString()}) × 0% = -$0`;
      document.getElementById('discountLabelText').textContent = discountParts.length > 0
        ? `Base Discount (${discountParts.join(' + ')})`
        : 'Base Discount (0%)';
      document.getElementById('discountPriceText').textContent = `-$${formatMoney(discountAmount)}`;
      document.getElementById('discountBreakdownRow').classList.toggle('is-active-discount', discountAmount > 0);

      // 2-B. Populate Fabric / Louvre Blade / OZTECH Roof Breakdown Row
      if (activeCategory === 'LOUVRE') {
        const bCount = (bladeCheck && bladeCheck.valid) ? `${bladeCheck.match.blades} Blades` : 'Aluminum Blades';
        fabricLabelText.textContent = `Louvre Spec (${bCount} • ${louvreBaseSpec.replace(' Module', '')})`;
        fabricPriceText.textContent = 'Included';
      } else if (activeCategory === 'OZTECH') {
        fabricLabelText.textContent = `Roof Fabric (${fabricObj.name} • ${sqm.toFixed(1)} sqm)`;
        fabricPriceText.textContent = `+$${formatMoney(fabricCost)}`;
      } else if (isKit) {
        fabricLabelText.textContent = 'Fabric (KIT Only)';
        fabricPriceText.textContent = '+$0';
      } else {
        fabricLabelText.textContent = `Fabric (${fabricObj.name} • ${sqm.toFixed(1)} sqm)`;
        fabricPriceText.textContent = `+$${formatMoney(fabricCost)}`;
      }
      document.getElementById('fabricBreakdownRow').classList.toggle('is-active-addon', fabricCost > 0);

      // 2-C. OZTECH Front/Back Height Display (No Surcharge), Front Post Deduction (-$80/ea) & Gutter Cover (+$45/m)
      let oztechPostDeduction = 0;
      let oztechGutterCoverCost = 0;
      let ozStructBadgeDesc = '';

      const oztechHeightBreakdownRow = document.getElementById('oztechHeightBreakdownRow');
      const oztechPostBreakdownRow = document.getElementById('oztechPostBreakdownRow');
      const oztechGutterCoverBreakdownRow = document.getElementById('oztechGutterCoverBreakdownRow');

      if (activeCategory === 'OZTECH') {
        if (oztechHeightBreakdownRow) oztechHeightBreakdownRow.style.display = 'flex';
        if (oztechPostBreakdownRow) oztechPostBreakdownRow.style.display = 'flex';
        if (oztechGutterCoverBreakdownRow) oztechGutterCoverBreakdownRow.style.display = 'flex';

        // 1) Front Height & Back Height (Display only — no extra height surcharge; IZI SLOPE uses single Height only)
        const isIziSlope = product && product.group === 'IZI SLOPE';
        const frontHeightM = parseHeightMeters(document.getElementById('oztechFrontHeightInput')?.value);
        const backHeightM = parseHeightMeters(document.getElementById('oztechBackHeightInput')?.value);
        const frontHeightMm = Math.round(frontHeightM * 1000);
        const backHeightMm = Math.round(backHeightM * 1000);

        const frontPillEl = document.getElementById('oztechFrontHeightPill');
        const backPillEl = document.getElementById('oztechBackHeightPill');
        const frontHintEl = document.getElementById('oztechFrontHeightHint');
        if (frontPillEl) {
          frontPillEl.textContent = `${frontHeightM.toFixed(2)}M (${frontHeightMm.toLocaleString()} mm)`;
        }
        if (backPillEl) {
          backPillEl.textContent = `${backHeightM.toFixed(2)}M (${backHeightMm.toLocaleString()} mm)`;
        }
        if (frontHintEl) {
          const hLabel = isIziSlope ? 'Height' : 'Front Height';
          frontHintEl.textContent = `* ${hLabel} (Enter in mm e.g. 2250 or m e.g. 2.25)`;
        }

        if (isIziSlope) {
          document.getElementById('oztechHeightLabelText').textContent = `Height (${frontHeightM.toFixed(2)}m)`;
        } else {
          document.getElementById('oztechHeightLabelText').textContent = `Heights (${frontHeightM.toFixed(2)}m / ${backHeightM.toFixed(2)}m)`;
        }
        document.getElementById('oztechHeightPriceText').textContent = '+$0';
        oztechHeightBreakdownRow?.classList.remove('is-active-addon');

        // 2) Front Post Exclusion (-$80/ea, editable quantity)
        const isNoPostChecked = Boolean(document.getElementById('oztechNoPostCheck')?.checked);
        const rawNoPostQty = parseInt(document.getElementById('oztechNoPostQty')?.value, 10);
        const defaultPostQty = getDefaultOztechPostCount();
        const noPostQty = (isNaN(rawNoPostQty) || rawNoPostQty < 1) ? defaultPostQty : rawNoPostQty;
        oztechPostDeduction = isNoPostChecked ? Math.round((noPostQty * 80 + Number.EPSILON) * 100) / 100 : 0;

        const noPostCard = document.getElementById('oztechNoPostCard');
        const noPostBadge = document.getElementById('oztechNoPostBadge');
        if (noPostCard) noPostCard.classList.toggle('checked', isNoPostChecked);
        if (noPostBadge) {
          noPostBadge.textContent = isNoPostChecked
            ? `-$${formatMoney(oztechPostDeduction)}`
            : `$0`;
        }

        document.getElementById('oztechPostLabelText').textContent = isNoPostChecked
          ? `Front Posts (-${noPostQty} ea)`
          : `Front Posts (${defaultPostQty} ea)`;
        document.getElementById('oztechPostPriceText').textContent = isNoPostChecked
          ? `-$${formatMoney(oztechPostDeduction)}`
          : '$0';
        oztechPostBreakdownRow?.classList.toggle('is-active-discount', oztechPostDeduction > 0);

        // 3) Gutter Cover (+$45/m by System Width)
        const isGutterCoverChecked = Boolean(document.getElementById('oztechGutterCoverCheck')?.checked);
        const gutterCoverCalc = Math.round((widthM * 45 + Number.EPSILON) * 100) / 100;
        oztechGutterCoverCost = isGutterCoverChecked ? gutterCoverCalc : 0;

        const gutterCoverCard = document.getElementById('oztechGutterCoverCard');
        const gutterCoverBadge = document.getElementById('oztechGutterCoverBadge');
        const gutterCoverSubtext = document.getElementById('oztechGutterCoverSubtext');
        const gutterCoverHint = document.getElementById('oztechGutterCoverHint');
        if (gutterCoverCard) gutterCoverCard.classList.toggle('checked', isGutterCoverChecked);
        if (gutterCoverSubtext) gutterCoverSubtext.textContent = `(${widthM.toFixed(2)}m × $45/m)`;
        if (gutterCoverBadge) {
          gutterCoverBadge.textContent = isGutterCoverChecked
            ? `+$${formatMoney(oztechGutterCoverCost)}`
            : `+$0`;
        }
        if (gutterCoverHint) {
          gutterCoverHint.textContent = isGutterCoverChecked
            ? `* Gutter Cover Active: Width ${widthM.toFixed(2)}m × $45/m = +$${formatMoney(oztechGutterCoverCost)}`
            : `* Surcharge = System Width (${widthM.toFixed(2)}m) × $45/m = +$${formatMoney(gutterCoverCalc)}`;
        }

        document.getElementById('oztechGutterCoverLabelText').textContent = isGutterCoverChecked
          ? `Gutter Cover (${widthM.toFixed(2)}M)`
          : 'Gutter Cover (None)';
        document.getElementById('oztechGutterCoverPriceText').textContent = isGutterCoverChecked
          ? `+$${formatMoney(oztechGutterCoverCost)}`
          : '+$0';
        oztechGutterCoverBreakdownRow?.classList.toggle('is-active-addon', oztechGutterCoverCost > 0);

        const structBadgeParts = [
          isIziSlope ? `H: ${frontHeightM.toFixed(2)}m` : `H: ${frontHeightM.toFixed(2)}m/${backHeightM.toFixed(2)}m`
        ];
        if (isNoPostChecked) structBadgeParts.push(`No Front Posts (-$${formatMoney(oztechPostDeduction)})`);
        if (isGutterCoverChecked) structBadgeParts.push(`Gutter Cover (+$${formatMoney(oztechGutterCoverCost)})`);
        ozStructBadgeDesc = ` • ${structBadgeParts.join(' • ')}`;
      } else if (activeCategory === 'LOUVRE') {
        if (oztechHeightBreakdownRow) oztechHeightBreakdownRow.style.display = 'none';
        if (oztechGutterCoverBreakdownRow) oztechGutterCoverBreakdownRow.style.display = 'none';
        if (oztechPostBreakdownRow) oztechPostBreakdownRow.style.display = 'flex';

        const defaultLouvrePosts = getDefaultLouvrePostCount(rawWidth, rawProj);
        const louvreNoPostCheckEl = document.getElementById('louvreNoPostCheck');
        const louvreNoPostQtyEl = document.getElementById('louvreNoPostQty');
        const louvreNoPostCardEl = document.getElementById('louvreNoPostCard');
        const louvreNoPostBadgeEl = document.getElementById('louvreNoPostBadge');
        const louvreNoPostHintEl = document.getElementById('louvreNoPostHint');

        const isLouvreNoPostChecked = Boolean(louvreNoPostCheckEl && louvreNoPostCheckEl.checked);
        let louvreNoPostQty = louvreNoPostQtyEl ? parseInt(louvreNoPostQtyEl.value, 10) : defaultLouvrePosts;
        if (isNaN(louvreNoPostQty) || louvreNoPostQty < 1) louvreNoPostQty = defaultLouvrePosts;
        if (louvreNoPostQty > 8) louvreNoPostQty = 8;

        oztechPostDeduction = isLouvreNoPostChecked ? (louvreNoPostQty * 80) : 0;

        if (louvreNoPostCardEl) louvreNoPostCardEl.classList.toggle('is-deducted', isLouvreNoPostChecked);
        if (louvreNoPostBadgeEl) {
          louvreNoPostBadgeEl.textContent = isLouvreNoPostChecked
            ? `-$${formatMoney(oztechPostDeduction)}`
            : `$0`;
        }
        if (louvreNoPostHintEl) {
          louvreNoPostHintEl.textContent = `* Standard Posts: Base 4 / Width > 5,500mm (+2) / Proj > 5,500mm (+2) (Current Std: ${defaultLouvrePosts} ea • Max 8 • -$80/ea)`;
        }

        document.getElementById('oztechPostLabelText').textContent = isLouvreNoPostChecked
          ? `Posts Excluded (-${louvreNoPostQty} ea)`
          : `Posts (${defaultLouvrePosts} ea)`;
        document.getElementById('oztechPostPriceText').textContent = isLouvreNoPostChecked
          ? `-$${formatMoney(oztechPostDeduction)}`
          : '$0';
        oztechPostBreakdownRow?.classList.toggle('is-active-discount', oztechPostDeduction > 0);

        if (isLouvreNoPostChecked) {
          ozStructBadgeDesc = ` • No Posts (-$${formatMoney(oztechPostDeduction)})`;
        }
      } else {
        if (oztechHeightBreakdownRow) oztechHeightBreakdownRow.style.display = 'none';
        if (oztechPostBreakdownRow) oztechPostBreakdownRow.style.display = 'none';
        if (oztechGutterCoverBreakdownRow) oztechGutterCoverBreakdownRow.style.display = 'none';
      }

      // 3. Calculate Motor Surcharge & Sensor/Remote Options if Motorised
      let motorCost = 0;
      let sensorCost = 0;
      const selectedSensors = [];

      if (operation === 'motorised') {
        const activeMotors = getActiveMotors(product);
        const motorObj = (activeMotors && activeMotors[motorKey]) ? activeMotors[motorKey] : DB.motors[motorKey];
        if (activeMotors && activeMotors[motorKey]) {
          motorCost = motorObj.prices[widthIndex] || 0;
          document.getElementById(`tr-m-${motorKey}`)?.classList.add('selected-motor-row');
          document.getElementById(`cell-m-${motorKey}-${matchedWidth}`)?.classList.add('selected-motor-cell');
          motorLabelText.textContent = `Motor (${motorObj.name})`;
          motorPriceText.textContent = (motorCost === 0 && (product.motorisedPrices || activeCategory === 'LOUVRE'))
            ? 'Included (+$0)'
            : `+$${motorCost.toLocaleString()}`;
        } else {
          motorCost = 0;
          motorLabelText.textContent = activeCategory === 'OZTECH'
            ? `Motor (${motorObj.name} • System Standard)`
            : `Motor (${motorObj.name} • Motor Table Pending)`;
          motorPriceText.textContent = '+$0';
        }

        document.querySelectorAll('.sensor-checkbox:checked').forEach(cb => {
          const sPrice = parseFloat(cb.dataset.price) || 0;
          const sName = cb.dataset.name;
          sensorCost += sPrice;
          selectedSensors.push(sName);
          document.getElementById(`tr-sen-${cb.value}`)?.classList.add('sensor-item-selected');
        });

        if (selectedSensors.length > 0) {
          sensorLabelText.textContent = `Sensor, Remote & Controls (${selectedSensors.join(', ')})`;
          sensorPriceText.textContent = `+$${sensorCost.toLocaleString()}`;
        } else {
          sensorLabelText.textContent = 'Sensor & Remote (None)';
          sensorPriceText.textContent = '+$0';
        }
      } else if (operation === 'spring') {
        motorLabelText.textContent = 'Operation (Spring • Included in Base Table)';
        motorPriceText.textContent = '+$0';
        sensorLabelText.textContent = 'Sensor & Remote (N/A)';
        sensorPriceText.textContent = '+$0';
      } else {
        motorLabelText.textContent = 'Operation (Manual Gear)';
        motorPriceText.textContent = '+$0';
        sensorLabelText.textContent = 'Sensor & Remote (N/A)';
        sensorPriceText.textContent = '+$0';
      }
      document.getElementById('motorBreakdownRow').classList.toggle('is-active-addon', motorCost > 0);
      document.getElementById('sensorBreakdownRow').classList.toggle('is-active-addon', sensorCost > 0);

      // 4. Calculate Powder Coat Surcharge
      let pcCost = 0;
      let pcBadgeLabel = pcOption.label;
      if (activeCategory === 'OZTECH') {
        const pcDb = DB.oztechFullPowderCoat;
        const ozPcType = document.getElementById('oztechPcTypeSelect')?.value || 'frame';
        const ozPcTypeHint = document.getElementById('oztechPcTypeHint');
        const powderCoatHint = document.getElementById('powderCoatHint');
        const duratecRate = pcDb.duratecRate || 0.128;
        const isDuratec = pcOption.tier === 'duratec';
        const duratecCost = isDuratec
          ? Math.round((basePrice * duratecRate + Number.EPSILON) * 100) / 100
          : 0;

        let fullPcPrice = 0;
        let pcMatchedW = null;
        let pcMatchedP = null;

        if (ozPcType === 'full') {
          pcMatchedW = pcDb.widths.find(w => w >= rawWidth) || pcDb.widths[pcDb.widths.length - 1];
          pcMatchedP = pcDb.projections.find(p => p >= rawProj) || pcDb.projections[pcDb.projections.length - 1];
          fullPcPrice = pcDb.prices[pcMatchedP]?.[pcMatchedW] || 0;
          document.getElementById(`th-ozpc-w-${pcMatchedW}`)?.classList.add('selected-col');
          document.getElementById(`tr-ozpc-p-${pcMatchedP}`)?.classList.add('selected-pc-row');
          document.getElementById(`cell-ozpc-${pcMatchedP}-${pcMatchedW}`)?.classList.add('selected-pc-cell');
        }

        pcCost = Math.round((duratecCost + fullPcPrice + Number.EPSILON) * 100) / 100;

        if (ozPcTypeHint) {
          ozPcTypeHint.textContent = ozPcType === 'full'
            ? `* FULL Selected (Tier ${pcMatchedW.toLocaleString()}×${pcMatchedP.toLocaleString()} mm): +$${fullPcPrice.toLocaleString()}`
            : '* Default: FRAME (+$0) • Select FULL to add Fabric Support Bar Frame Colour Price';
        }
        if (powderCoatHint) {
          powderCoatHint.textContent = isDuratec
            ? `* Duratec Selected: Base ($${basePrice.toLocaleString()}) × 0.128 = +$${formatMoney(duratecCost)}`
            : '* All Duralloy: +$0 • Duratec: Base System Price × 0.128';
        }

        const finishPart = isDuratec ? 'Duratec (+12.8%)' : 'Duralloy';
        const typePart = ozPcType === 'full' ? 'FULL' : 'FRAME';

        pcLabelText.textContent = `Powder Coat (${typePart} • ${finishPart})`;
        pcPriceText.textContent = pcCost > 0 ? `+$${formatMoney(pcCost)}` : 'Included';
        pcBadgeLabel = `${ozPcType.toUpperCase()} (${isDuratec ? 'Duratec' : 'All Duralloy'})`;
      } else if (activeCategory === 'LOUVRE') {
        const duratecRate = product.powderCoatRule?.duratecRate || 0.0128;
        if (pcOption.tier === 'duratec') {
          pcCost = Math.round(basePrice * duratecRate * 100) / 100;
          document.getElementById('tr-pc-duratec')?.classList.add('selected-pc-row');
          document.getElementById('cell-pc-duratec')?.classList.add('selected-pc-cell');
          pcLabelText.textContent = 'Powder Coat (Duratec +1.28%)';
          pcPriceText.textContent = `+$${formatMoney(pcCost)}`;
        } else {
          pcCost = 0;
          document.getElementById('tr-pc-duralloy')?.classList.add('selected-pc-row');
          pcLabelText.textContent = 'Powder Coat (Duralloy)';
          pcPriceText.textContent = 'Included';
        }
      } else if (pcOption.tier && product.powderCoat && product.powderCoat[pcOption.tier]) {
        const pcTierObj = product.powderCoat[pcOption.tier];
        pcCost = pcTierObj.prices[widthIndex] || 0;
        document.getElementById(`tr-pc-${pcOption.tier}`)?.classList.add('selected-pc-row');
        document.getElementById(`cell-pc-${pcOption.tier}-${matchedWidth}`)?.classList.add('selected-pc-cell');
        pcLabelText.textContent = `Powder Coat (${pcOption.label})`;
        pcPriceText.textContent = `+$${pcCost.toLocaleString()}`;
      } else if (pcOption.tier && !product.powderCoat) {
        pcLabelText.textContent = `Powder Coat (${pcOption.label} • Pending Table)`;
        pcPriceText.textContent = '+$0';
      } else {
        pcLabelText.textContent = `Powder Coat (${pcOption.label})`;
        pcPriceText.textContent = '+$0';
      }
      document.getElementById('pcBreakdownRow').classList.toggle('is-active-addon', pcCost > 0);

      // 5. Calculate & Validate LED Lighting Surcharge (FAA, LOUVRE & OZTECH)
      let ledCost = 0;
      let ozLedBadgeDesc = '';
      const ledBreakdownRow = document.getElementById('ledBreakdownRow');
      if (activeCategory === 'DROP A') {
        ledBreakdownRow.style.display = 'none';
      } else if (activeCategory === 'OZTECH') {
        ledBreakdownRow.style.display = 'flex';
        const ledDb = DB.oztechLedLighting;
        const gutterExcluded = isOztechGutterLedExcluded(product);
        const isGutterLedChecked = Boolean(document.getElementById('oztechGutterLedCheck')?.checked) && !gutterExcluded;
        const ozMainLedName = ledKey === 'uniled'
          ? 'UNILED (Standard LED)'
          : (ledKey === 'maxi_led' ? 'MAXI LED (Full Width)' : null);
        const ozLedParts = [];
        const dimmerSelectEl = document.getElementById('louvreDimmerSelect');
        const isOzDimmerSelected = dimmerSelectEl && !dimmerSelectEl.disabled && dimmerSelectEl.value === 'yes';

        if (ozMainLedName) {
          const mainLedEntry = ledDb[ledKey];
          const ledMatchedW = ledDb.widths.find(w => w >= rawWidth);
          const ledMatchedP = ledDb.projections.find(p => p >= rawProj);
          if (!ledMatchedW || !ledMatchedP) {
            setErrorState(
              `${ozMainLedName} Size Limit Exceeded`,
              'Not Available (N/A)',
              `${ozMainLedName} Max Size: Width 13,000 mm × Projection 10,000 mm (Entered: ${rawWidth} × ${rawProj} mm)`,
              showAlert,
              `⚠️ Warning: ${ozMainLedName} is available up to Width 13,000 mm × Projection 10,000 mm. Your entered size is ${rawWidth} mm × ${rawProj} mm.`
            );
            return;
          }
          const mainPrice = mainLedEntry?.prices?.[ledMatchedP]?.[ledMatchedW] || 0;
          document.getElementById(`th-ozled-${ledKey}-w-${ledMatchedW}`)?.classList.add('selected-col');
          document.getElementById(`tr-ozled-${ledKey}-p-${ledMatchedP}`)?.classList.add('selected-led-row');
          document.getElementById(`cell-ozled-${ledKey}-${ledMatchedP}-${ledMatchedW}`)?.classList.add('selected-led-cell');

          if (mainPrice === 0) {
            setErrorState(
              `Unavailable ${ozMainLedName} Size`,
              'Not Available (N/A)',
              `${ozMainLedName} is not available for Tier Width ${ledMatchedW.toLocaleString()} mm × Projection ${ledMatchedP.toLocaleString()} mm`,
              showAlert,
              `⚠️ Warning: ${ozMainLedName} is not available for Tier Width ${ledMatchedW.toLocaleString()} mm × Projection ${ledMatchedP.toLocaleString()} mm.`
            );
            return;
          }

          ledCost += mainPrice;
          ozLedParts.push(ledKey === 'uniled' ? 'UNILED' : 'MAXI LED');

          if (isOzDimmerSelected && mainLedEntry.dimmerPrice) {
            ledCost += mainLedEntry.dimmerPrice;
            ozLedParts.push('Dimmer');
          }
        }

        if (isGutterLedChecked) {
          const gutterMatchedW = ledDb.widths.find(w => w >= rawWidth) || ledDb.widths[ledDb.widths.length - 1];
          const gutterPrice = ledDb.gutter_led?.pricesByWidth?.[gutterMatchedW] || 0;
          document.getElementById(`th-ozled-gutter-w-${gutterMatchedW}`)?.classList.add('selected-col');
          document.getElementById('tr-ozled-gutter')?.classList.add('selected-led-row');
          document.getElementById(`cell-ozled-gutter-${gutterMatchedW}`)?.classList.add('selected-led-cell');

          if (gutterPrice > 0) {
            ledCost += gutterPrice;
            ozLedParts.push('Gutter LED');
          }
        }

        if (ozLedParts.length > 0) {
          ledLabelText.textContent = `LED (${ozLedParts.join(' + ')})`;
          ledPriceText.textContent = `+$${ledCost.toLocaleString()}`;
          ozLedBadgeDesc = ` • ${ozLedParts.join(' + ')}`;
        } else {
          ledLabelText.textContent = 'LED Lighting (None)';
          ledPriceText.textContent = '+$0';
          ozLedBadgeDesc = ' • No LED';
        }
        ledBreakdownRow.classList.toggle('is-active-addon', ledCost > 0);
      } else if (activeCategory === 'LOUVRE') {
        ledBreakdownRow.style.display = 'flex';
        const isGrandLouvre = getCurrentProductKey() === 'grand_louvre';
        const dimmerSelectEl = document.getElementById('louvreDimmerSelect');
        const isBeckerDimmerSelected = (!isGrandLouvre && motorKey === 'becker' && dimmerSelectEl?.value === 'yes');
        const dimmerCost = isBeckerDimmerSelected ? 350 : 0;

        if (ledKey !== 'none') {
          if (product.ledPrices) {
            const ledProjs = product.ledProjections || Object.keys(product.ledPrices).map(Number);
            const matchedLedProj = ledProjs.find(lp => lp >= rawProj) ||
              ((bladeCheck && bladeCheck.valid) ? ledProjs[ledProjs.length - 1] : null);
            const rawLedCost = getLouvreLedPrice(product, matchedLedProj, matchedWidth);
            const gutterLedPrice = rawLedCost || 0;
            if (matchedLedProj) {
              document.getElementById(`tr-louvre-led-${matchedLedProj}`)?.classList.add('selected-led-row');
              document.getElementById(`cell-louvre-led-${matchedLedProj}-${matchedWidth}`)?.classList.add('selected-led-cell');
            }
            if (gutterLedPrice === 0) {
              setErrorState(
                'Unavailable Gutter LED Size',
                'Not Available (N/A)',
                `Gutter LED is not available for Width ${matchedWidth} mm × Projection ${matchedLedProj} mm on ${product.name}`,
                showAlert,
                `⚠️ Warning: Gutter LED is not available for Width ${matchedWidth} mm × Projection ${matchedLedProj} mm on ${product.name}.`
              );
              return;
            }
            ledCost = gutterLedPrice + dimmerCost;
            updateLouvreLedToggleUI(gutterLedPrice);
            const dimmerDesc = isGrandLouvre
              ? ' • Dimmer Default Included'
              : (isBeckerDimmerSelected ? ' + Becker Dimmer (+$350)' : '');
            ledLabelText.textContent = `Gutter LED (Tier ${matchedWidth}×${matchedLedProj} mm${dimmerDesc})`;
            ledPriceText.textContent = `+$${ledCost.toLocaleString()}`;
          } else {
            ledCost = dimmerCost;
            updateLouvreLedToggleUI(0);
            ledLabelText.textContent = 'Gutter LED (Selected • LED Price Table Pending)';
            ledPriceText.textContent = `+$${ledCost.toLocaleString()}`;
          }
        } else {
          ledCost = dimmerCost;
          updateLouvreLedToggleUI(0);
          if (isGrandLouvre) {
            ledLabelText.textContent = 'LED Lighting (None • Dimmer Option Default Included)';
            ledPriceText.textContent = 'Included (+$0)';
          } else if (isBeckerDimmerSelected) {
            ledLabelText.textContent = 'Lighting & Dimmer (No LED • Becker Dimmer Option Included)';
            ledPriceText.textContent = `+$${dimmerCost.toLocaleString()}`;
          } else {
            ledLabelText.textContent = 'LED Lighting & Dimmer (None)';
            ledPriceText.textContent = '+$0';
          }
        }
        ledBreakdownRow.classList.toggle('is-active-addon', ledCost > 0);
      } else {
        ledBreakdownRow.style.display = 'flex';
        if (ledKey !== 'none') {
          const ledObj = DB.ledLighting[ledKey];

          if (operation !== 'motorised') {
            setErrorState(
              'LED Option Not Available with Manual Gear',
              'Motor Required',
              `Selected LED: ${ledObj.name}`,
              showAlert,
              `⚠️ Warning: ${ledObj.name} requires a Motorised operation (Alpha, Becker, or Somfy). It cannot be applied to Manual Gear.`
            );
            return;
          }

          if (motorKey === 'ace') {
            setErrorState(
              'LED Option Not Available for ACE Motor',
              'Not Available (ACE)',
              `Selected: ACE Motor + ${ledObj.name}`,
              showAlert,
              `⚠️ Warning: LED Lighting (${ledObj.name}) is not applicable with the ACE motor. Please select Alpha, Becker, or Somfy.`
            );
            return;
          }

          document.getElementById(`tr-led-${ledKey}-${motorKey}`)?.classList.add('selected-led-row');
          document.getElementById(`cell-led-${ledKey}-${motorKey}-${matchedWidth}`)?.classList.add('selected-led-cell');

          if (matchedProj > ledObj.maxProjection) {
            setErrorState(
              `${ledObj.name} Projection Limit Exceeded`,
              'Not Available (Proj > 3.1M)',
              `Applied Tier: Width ${matchedWidth} mm × Projection ${matchedProj} mm (Max 3,100 mm)`,
              showAlert,
              `⚠️ Warning: ${ledObj.name} is only available up to 3,100 mm (3.1M) projection. Your matched projection is ${matchedProj} mm.`
            );
            return;
          }

          ledCost = ledObj.rows[motorKey].prices[widthIndex];
          if (ledCost === 0) {
            setErrorState(
              `Unavailable ${ledObj.name} Size`,
              'Not Available (N/A)',
              `Selected: ${DB.motors[motorKey].name} + ${ledObj.name} at Width ${matchedWidth} mm`,
              showAlert,
              `⚠️ Warning: ${ledObj.name} with ${DB.motors[motorKey].name} motor is not available for Width ${matchedWidth} mm.`
            );
            return;
          }

          ledLabelText.textContent = `LED (${ledObj.name} - ${DB.motors[motorKey].name})`;
          ledPriceText.textContent = `+$${ledCost.toLocaleString()}`;
        } else {
          ledLabelText.textContent = 'LED Lighting (None)';
          ledPriceText.textContent = '+$0';
        }
        ledBreakdownRow.classList.toggle('is-active-addon', ledCost > 0);
      }

      // 6. Calculate Fabric Tray Option (Only for Family - Complete)
      let trayCost = 0;
      if (product.fabricTray) {
        trayBreakdownRow.style.display = 'flex';
        if (fabricTrayVal === 'yes') {
          trayCost = product.fabricTray[widthIndex];
          document.getElementById('tr-tray')?.classList.add('selected-tray-row');
          document.getElementById(`cell-tray-${matchedWidth}`)?.classList.add('selected-tray-cell');
          trayLabelText.textContent = 'Fabric Tray (Included)';
          trayPriceText.textContent = `+$${trayCost.toLocaleString()}`;
        } else {
          trayLabelText.textContent = 'Fabric Tray (No)';
          trayPriceText.textContent = '+$0';
        }
        trayBreakdownRow.classList.toggle('is-active-addon', trayCost > 0);
      } else {
        trayBreakdownRow.style.display = 'none';
      }

      // 7. Calculate Additional Brackets & Extras (Multi-select + Quantity)
      let bracketCost = 0;
      const selectedBrackets = [];
      const activeBrackets = getActiveBrackets(product);
      const bracketBreakdownRow = document.getElementById('bracketBreakdownRow');

      if (!activeBrackets || activeBrackets.length === 0) {
        bracketBreakdownRow.style.display = 'none';
      } else {
        bracketBreakdownRow.style.display = 'flex';
        document.querySelectorAll('.bracket-checkbox:checked').forEach(cb => {
          const unitPrice = parseFloat(cb.dataset.price) || 0;
          const bName = cb.dataset.name;
          const qtyInput = document.getElementById(`qty-${cb.value}`);
          let qty = parseInt(qtyInput?.value, 10);
          if (isNaN(qty) || qty < 1) qty = 1;

          const sub = unitPrice * qty;
          bracketCost += sub;
          selectedBrackets.push(`${bName} ×${qty}`);
          document.getElementById(`tr-brk-${cb.value}`)?.classList.add('bracket-item-selected');
        });

        const bracketSelectedBadge = document.getElementById('bracketSelectedBadge');
        if (selectedBrackets.length > 0) {
          bracketSelectedBadge.textContent = `${selectedBrackets.length} selected (+$${bracketCost.toLocaleString()})`;
          bracketSelectedBadge.classList.add('has-items');
          bracketLabelText.textContent = `Brackets & Extras (${selectedBrackets.join(', ')})`;
          bracketPriceText.textContent = `+$${bracketCost.toLocaleString()}`;
        } else {
          bracketSelectedBadge.textContent = '0 selected';
          bracketSelectedBadge.classList.remove('has-items');
          bracketLabelText.textContent = 'Brackets & Extras (None)';
          bracketPriceText.textContent = '+$0';
        }
        bracketBreakdownRow.classList.toggle('is-active-addon', bracketCost > 0);
      }

      const totalPrice = Math.round((basePrice - discountAmount + fabricCost - oztechPostDeduction + oztechGutterCoverCost + motorCost + sensorCost + pcCost + ledCost + trayCost + bracketCost) * 100) / 100;

      const activeMotors = getActiveMotors(product);
      const motorNameForBadge = (activeMotors && activeMotors[motorKey])
        ? activeMotors[motorKey].name
        : (DB.motors[motorKey]?.name || motorKey);
      const opDesc = operation === 'motorised'
        ? `Motorised (${motorNameForBadge})`
        : (operation === 'spring' ? 'Spring' : 'Manual Gear');
      const isGrandLouvreBadge = getCurrentProductKey() === 'grand_louvre';
      const ledDesc = activeCategory === 'FAA'
        ? ` • ${ledKey === 'none' ? 'No LED' : DB.ledLighting[ledKey].name}`
        : (activeCategory === 'LOUVRE'
            ? ` • ${ledKey === 'none' ? (isGrandLouvreBadge ? 'No LED (Dimmer Included)' : 'No LED') : (isGrandLouvreBadge ? 'Gutter LED + Default Dimmer' : 'Gutter LED')}`
            : (activeCategory === 'OZTECH' ? ozLedBadgeDesc : ''));
      const trayDesc = (product.fabricTray && fabricTrayVal === 'yes') ? ' • Fabric Tray' : '';
      const discDesc = totalDiscountRate > 0 ? ` • Base Discount ${totalDiscountRate}% (-$${formatMoney(discountAmount)})` : '';
      const fabDesc = activeCategory === 'LOUVRE'
        ? `${bladeCheck && bladeCheck.valid ? bladeCheck.match.blades + ' Blades' : 'Louvre'} (${louvreBaseSpec})`
        : (activeCategory === 'OZTECH'
            ? `${fabricObj.name} (${sqm.toFixed(2)} sqm)`
            : (isKit ? 'No Fabric (KIT)' : fabricObj.name));

      // Valid Price Output
      resultBox.className = 'result-box active';
      resultLabel.textContent = 'Total Estimated Price';
      resultPrice.textContent = `$${formatMoney(totalPrice)}`;
      basePriceText.textContent = `$${basePrice.toLocaleString()}`;
      breakdownBox.style.display = 'block';
      resultBadge.style.display = 'block';
      resultBadge.textContent = `${product.name} (${supplyLabel}) • ${fabDesc}${ozStructBadgeDesc} • ${opDesc} • ${pcBadgeLabel}${ledDesc}${trayDesc}${discDesc}`;
    }

    // Event Listeners for Category Tabs
    document.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setCategory(this.dataset.category);
      });
    });

    // Helper & Event Listeners for FAA Product Model Green Buttons & Supply Type Purple Buttons
    function setFaaModel(modelKey, triggerCalc = true) {
      const productSelect = document.getElementById('productSelect');
      if (productSelect) {
        productSelect.value = modelKey;
      }
      document.querySelectorAll('#faaModelTabs .faa-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === modelKey);
      });
      if (triggerCalc) {
        updateInputHints();
        renderTable();
        calculatePrice(true);
      }
    }

    document.querySelectorAll('#faaModelTabs .faa-model-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setFaaModel(this.dataset.model, true);
      });
    });

    function setFaaSupplyType(supplyVal, triggerChange = true) {
      const sel = document.getElementById('supplyTypeSelect');
      if (sel) sel.value = supplyVal;
      document.querySelectorAll('.faa-supply-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.supply === supplyVal);
      });
      if (triggerChange && sel) {
        sel.dispatchEvent(new Event('change'));
      }
    }

    document.querySelectorAll('.faa-supply-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setFaaSupplyType(this.dataset.supply, true);
      });
    });

    // Event Listeners for DROP A Group & Sub-Model Selects & Buttons
    function setDropAGroup(groupId, triggerChange = true) {
      const sel = document.getElementById('dropAGroupSelect');
      if (sel) sel.value = groupId;
      document.querySelectorAll('.dropa-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === groupId);
      });
      if (triggerChange && sel) {
        sel.dispatchEvent(new Event('change'));
      }
    }

    document.querySelectorAll('.dropa-model-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setDropAGroup(this.dataset.group, true);
      });
    });

    document.getElementById('dropAGroupSelect').addEventListener('change', function() {
      const val = this.value;
      document.querySelectorAll('.dropa-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === val);
      });
      populateDropASubModels();
      populateOperationOptions();
      populateLedOptions();
      populatePowderCoatOptions();
      renderBracketOptions();
      renderBracketReference();
      renderSensorOptions();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    document.getElementById('dropASubSelect').addEventListener('change', function() {
      const val = this.value;
      document.querySelectorAll('.dropa-sub-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === val);
      });
      populateOperationOptions();
      populateLedOptions();
      populatePowderCoatOptions();
      renderSensorOptions();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    // Event Listener for LOUVRE Product Model Select & Buttons
    function setLouvreModel(modelId, triggerChange = true) {
      const sel = document.getElementById('louvreProductSelect');
      if (sel) sel.value = modelId;
      document.querySelectorAll('.louvre-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === modelId);
      });
      if (triggerChange && sel) {
        sel.dispatchEvent(new Event('change'));
      }
    }

    document.querySelectorAll('.louvre-model-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setLouvreModel(this.dataset.model, true);
      });
    });

    document.getElementById('louvreProductSelect').addEventListener('change', function() {
      const val = this.value;
      document.querySelectorAll('.louvre-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.model === val);
      });
      populateOperationOptions(true);
      populateLedOptions();
      populateDimmerOptions();
      populatePowderCoatOptions();
      renderBracketOptions();
      renderBracketReference();
      renderSensorOptions();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    // Event Listeners for OZTECH Product Series, Sub-Type, Module & Overhang
    function setOztechGroup(groupId, triggerChange = true) {
      const sel = document.getElementById('oztechGroupSelect');
      if (sel) sel.value = groupId;
      document.querySelectorAll('.oztech-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === groupId);
      });
      if (triggerChange && sel) {
        sel.dispatchEvent(new Event('change'));
      }
    }

    document.querySelectorAll('.oztech-model-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setOztechGroup(this.dataset.group, true);
      });
    });

    document.getElementById('oztechGroupSelect').addEventListener('change', function() {
      const val = this.value;
      document.querySelectorAll('.oztech-model-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === val);
      });
      populateOztechSubModels();
      updateOztechModuleHints();
      syncOztechDefaultPostQty();
      updateOztechGutterLedUI();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    document.getElementById('oztechSubSelect').addEventListener('change', function() {
      const val = this.value;
      document.querySelectorAll('.oztech-sub-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === val);
      });
      updateOztechModuleHints();
      syncOztechDefaultPostQty();
      updateOztechGutterLedUI();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    document.getElementById('oztechModuleSelect').addEventListener('change', function() {
      const modInfo = getCurrentOztechModuleInfo();
      const curW = parseFloat(document.getElementById('widthInput').value);
      if (curW < modInfo.minWidth) {
        document.getElementById('widthInput').value = modInfo.widths[0];
      } else if (curW > modInfo.overhangMaxWidth) {
        document.getElementById('widthInput').value = modInfo.maxWidth;
      }
      updateOztechModuleHints();
      syncOztechDefaultPostQty();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    });

    document.getElementById('oztechOverhangCheck').addEventListener('change', function() {
      updateOztechModuleHints();
      updateInputHints();
      calculatePrice(false);
    });

    document.getElementById('oztechFrontHeightInput').addEventListener('input', function() {
      calculatePrice(false);
    });

    document.getElementById('oztechBackHeightInput').addEventListener('input', function() {
      calculatePrice(false);
    });

    document.getElementById('oztechNoPostCheck').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('oztechNoPostQty').addEventListener('input', function() {
      calculatePrice(false);
    });

    document.getElementById('oztechGutterCoverCheck').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('louvreNoPostCheck')?.addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('louvreNoPostQty')?.addEventListener('input', function() {
      let val = parseInt(this.value, 10);
      if (val > 8) this.value = 8;
      calculatePrice(false);
    });

    // Form Submit & Reset
    document.getElementById('calcForm').addEventListener('submit', function(e) {
      e.preventDefault();
      calculatePrice(true);
    });

    function resetCalculatorConfiguration(resetToDefaultCategory = false) {
      if (resetToDefaultCategory && activeCategory !== 'FAA') {
        setCategory('FAA');
      }
      if (activeCategory === 'DROP A') {
        setDropAGroup('GENIUS', false);
        populateDropASubModels();
        setDropASubModel('genius_zip', false);
        document.getElementById('widthInput').value = 2400;
        document.getElementById('projInput').value = 2000;
      } else if (activeCategory === 'LOUVRE') {
        setLouvreModel('grand_louvre', false);
        document.getElementById('widthInput').value = 3000;
        document.getElementById('projInput').value = 3000;
        const louvreNoPostCheck = document.getElementById('louvreNoPostCheck');
        if (louvreNoPostCheck) louvreNoPostCheck.checked = false;
        syncLouvreDefaultPostQty(true);
      } else if (activeCategory === 'OZTECH') {
        setOztechGroup('IZI', false);
        populateOztechSubModels();
        document.getElementById('oztechModuleSelect').value = 'single';
        document.getElementById('oztechOverhangCheck').checked = false;
        document.getElementById('oztechFrontHeightInput').value = 2250;
        document.getElementById('oztechBackHeightInput').value = 2750;
        document.getElementById('oztechNoPostCheck').checked = false;
        syncOztechDefaultPostQty();
        document.getElementById('oztechGutterCoverCheck').checked = false;
        const gutterCheck = document.getElementById('oztechGutterLedCheck');
        if (gutterCheck) gutterCheck.checked = false;
        updateOztechGutterLedUI();
        updateOztechModuleHints();
        document.getElementById('widthInput').value = 3500;
        document.getElementById('projInput').value = 4000;
      } else {
        setFaaModel('titan_open', false);
        setFaaSupplyType('complete', false);
        document.getElementById('widthInput').value = 3800;
        document.getElementById('projSelect').value = '2600';
      }
      document.getElementById('discountInput').value = 0;
      const onsiteAssemblyCheck = document.getElementById('onsiteAssemblyCheck');
      if (onsiteAssemblyCheck) onsiteAssemblyCheck.checked = false;
      updateOnsiteAssemblyUI();
      populateFabricOptions(true);
      populateOperationOptions(true);
      populateLedOptions();
      populateDimmerOptions();
      if (activeCategory !== 'LOUVRE' && activeCategory !== 'OZTECH') {
        document.getElementById('operationSelect').value = 'manual';
        document.getElementById('motorSelect').value = 'ace';
        document.getElementById('motorSelect').disabled = true;
      }
      updateMotorButtonsUI();
      populatePowderCoatOptions();
      document.getElementById('powderCoatSelect').selectedIndex = 0;
      const ozPcTypeSelect = document.getElementById('oztechPcTypeSelect');
      if (ozPcTypeSelect) ozPcTypeSelect.value = 'frame';
      document.getElementById('ledSelect').value = 'none';
      updateOztechMainLedUI();
      updateLouvreLedToggleUI(0);
      if (activeCategory === 'OZTECH') populateDimmerOptions();
      document.getElementById('fabricTraySelect').value = 'no';

      const jobLabelInput = document.getElementById('jobItemLabelInput');
      const jobQtyInput = document.getElementById('jobItemQtyInput');
      if (jobLabelInput) jobLabelInput.value = '';
      if (jobQtyInput) jobQtyInput.value = '1';

      renderBracketOptions();
      renderBracketReference();
      renderSensorOptions();
      updateInputHints();
      renderTable();
      calculatePrice(false);
    }

    document.getElementById('resetBtn').addEventListener('click', function() {
      resetCalculatorConfiguration(false);
    });

    document.getElementById('widthInput').addEventListener('input', function() {
      if (activeCategory === 'OZTECH') {
        const w = parseFloat(this.value);
        if (!isNaN(w) && w > 0) {
          const product = getCurrentProduct();
          const modSelect = document.getElementById('oztechModuleSelect');
          const curModKey = modSelect.value;
          const curMod = getCurrentOztechModuleInfo();
          const singleMaxW = (product && product.moduleConfig && product.moduleConfig.single)
            ? product.moduleConfig.single.maxWidth
            : 5000;
          const isOverhang = isOztechOverhangChecked();
          let targetMod = curModKey;

          // If Overhang is checked and width is within current module's overhang range, keep current module
          const inCurrentOverhang = isOverhang && curMod && w >= curMod.minWidth && w <= curMod.overhangMaxWidth;
          if (!inCurrentOverhang) {
            if (w <= singleMaxW) {
              targetMod = 'single';
            } else if (w <= 9000) {
              targetMod = 'double';
            } else {
              targetMod = 'triple';
            }
          }

          if (targetMod !== curModKey) {
            modSelect.value = targetMod;
            updateOztechModuleHints();
            syncOztechDefaultPostQty();
            updateInputHints();
            renderTable();
          }
        }
      } else if (activeCategory === 'LOUVRE') {
        syncLouvreDefaultPostQty(false);
      }
      calculatePrice(false);
    });

    document.getElementById('projSelect').addEventListener('change', function() {
      calculatePrice(true);
    });

    document.getElementById('projInput').addEventListener('input', function() {
      if (activeCategory === 'LOUVRE') {
        syncLouvreDefaultPostQty(false);
      }
      calculatePrice(false);
    });

    document.getElementById('discountInput').addEventListener('input', function() {
      calculatePrice(false);
    });

    document.getElementById('onsiteAssemblyCheck').addEventListener('change', function() {
      updateOnsiteAssemblyUI();
      calculatePrice(false);
    });

    document.getElementById('onsiteAssemblyBtn')?.addEventListener('click', function() {
      const cb = document.getElementById('onsiteAssemblyCheck');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });

    document.getElementById('fabricSelect').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('productSelect').addEventListener('change', function() {
      updateInputHints();
      renderTable();
      calculatePrice(true);
    });

    document.getElementById('supplyTypeSelect').addEventListener('change', function() {
      updateInputHints();
      renderTable();
      calculatePrice(true);
    });

    document.getElementById('operationSelect').addEventListener('change', function() {
      const isMotorised = this.value === 'motorised';
      document.getElementById('motorSelect').disabled = !isMotorised;
      updateMotorButtonsUI();
      renderSensorOptions();
      if (activeCategory === 'DROP A') {
        renderTable();
      }
      calculatePrice(true);
    });

    document.getElementById('motorSelect').addEventListener('change', function() {
      populateDimmerOptions();
      renderSensorOptions();
      calculatePrice(true);
    });

    document.getElementById('louvreDimmerSelect').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('powderCoatSelect').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('oztechPcTypeSelect').addEventListener('change', function() {
      calculatePrice(false);
    });

    document.getElementById('ledSelect').addEventListener('change', function() {
      if (activeCategory === 'OZTECH') {
        updateOztechMainLedUI();
        populateDimmerOptions();
      } else if (activeCategory === 'LOUVRE') {
        updateLouvreLedToggleUI();
      }
      calculatePrice(true);
    });

    document.querySelectorAll('#oztechMainLedTabs .oztech-main-led-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const ledSelect = document.getElementById('ledSelect');
        if (ledSelect) {
          ledSelect.value = this.dataset.led;
          ledSelect.dispatchEvent(new Event('change'));
        }
      });
    });

    document.getElementById('louvreLedToggleBtn')?.addEventListener('click', function() {
      const ledSelect = document.getElementById('ledSelect');
      if (ledSelect) {
        ledSelect.value = ledSelect.value === 'louvre_led' ? 'none' : 'louvre_led';
        ledSelect.dispatchEvent(new Event('change'));
      }
    });

    document.getElementById('oztechGutterLedCheck').addEventListener('change', function() {
      updateOztechGutterLedUI();
      calculatePrice(false);
    });

    document.getElementById('oztechGutterLedBtnNone')?.addEventListener('click', function() {
      const cb = document.getElementById('oztechGutterLedCheck');
      if (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      }
    });

    document.getElementById('oztechGutterLedBtnYes')?.addEventListener('click', function() {
      if (this.disabled) return;
      const cb = document.getElementById('oztechGutterLedCheck');
      if (cb && !cb.disabled) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      }
    });

    // Show/Hide Toggle for Input Guide & Surcharge Formulas (Default Hidden)
    function toggleFormHints() {
      const isShowing = document.body.classList.toggle('show-hints');
      const form = document.getElementById('calcForm');
      if (form) form.classList.toggle('show-hints', isShowing);
      document.querySelectorAll('#toggleHintsBtn, .hint-toggle-sync').forEach(btn => {
        btn.classList.toggle('active', isShowing);
        btn.textContent = isShowing ? '🙈 Hide Guide' : 'ℹ️ Guide';
      });
    }

    document.querySelectorAll('#toggleHintsBtn, .hint-toggle-sync').forEach(btn => {
      btn.addEventListener('click', toggleFormHints);
    });

    document.getElementById('fabricTraySelect').addEventListener('change', function() {
      calculatePrice(false);
    });

    // Show/Hide Toggle for Additional Brackets & Extras (Default Hidden)
    function toggleBracketSection() {
      const box = document.getElementById('bracketBox');
      const btn = document.getElementById('toggleBracketFormBtn');
      const isHidden = box.style.display === 'none';
      box.style.display = isHidden ? 'block' : 'none';
      btn.textContent = isHidden ? '▲ Hide Brackets & Extras' : '▼ Show Brackets & Extras';
    }

    document.getElementById('bracketCollapsibleBar').addEventListener('click', function() {
      toggleBracketSection();
    });

    // Show/Hide Toggle for Reference Price Tables Card (Default Hidden)
    function toggleReferenceTablesSection() {
      const wrapper = document.getElementById('allReferenceTablesWrapper');
      const header = document.getElementById('refTablesCardHeader');
      const btn = document.getElementById('toggleAllTablesBtn');
      const isHidden = wrapper.style.display === 'none';
      wrapper.style.display = isHidden ? 'block' : 'none';
      header.classList.toggle('collapsed', !isHidden);
      btn.textContent = isHidden ? '▲ Hide Price Tables' : '▼ Show Price Tables';
    }

    document.getElementById('refTablesCardHeader').addEventListener('click', function() {
      toggleReferenceTablesSection();
    });

    // =========================================================================
    // ⚙️ PRICE TABLE & OPTION SETTINGS PAGE MANAGER
    // =========================================================================
    const CUSTOM_DB_STORAGE_KEY = 'system_price_calc_custom_db_v1';
    const DEFAULT_DB_SNAPSHOT = JSON.parse(JSON.stringify(DB));
    let activeSettingsCategory = 'FAA';

    function deepMergeDb(target, source) {
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach(key => {
        const srcVal = source[key];
        if (Array.isArray(srcVal)) {
          target[key] = JSON.parse(JSON.stringify(srcVal));
        } else if (key === 'fabrics' || key === 'oztechFabrics') {
          if (srcVal && typeof srcVal === 'object') {
            target[key] = JSON.parse(JSON.stringify(srcVal));
          }
        } else if (srcVal && typeof srcVal === 'object') {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          deepMergeDb(target[key], srcVal);
        } else if (srcVal !== undefined) {
          target[key] = srcVal;
        }
      });
    }

    function syncSharedOztechRefs() {
      if (DB.products.oztech_izi_slope_standard && DB.products.oztech_izi_standard) {
        DB.products.oztech_izi_slope_standard.modulePrices = DB.products.oztech_izi_standard.modulePrices;
      }
      if (DB.products.truscreen && (!DB.products.truscreen.motors || !DB.products.truscreen.motors.alpha)) {
        DB.products.truscreen.motors = JSON.parse(JSON.stringify(DEFAULT_DB_SNAPSHOT.products.truscreen.motors));
      }
      // Keep motor button subDesc badges in sync with updated prices
      const refreshMotorSubDesc = (motorsObj, hasIncludedBase = false) => {
        if (!motorsObj || typeof motorsObj !== 'object') return;
        Object.values(motorsObj).forEach(m => {
          if (!m || !Array.isArray(m.prices) || m.prices.length === 0 || m.subDesc === undefined) return;
          const minP = Math.min(...m.prices);
          const maxP = Math.max(...m.prices);
          if (minP === maxP) {
            m.subDesc = minP === 0
              ? 'Included (+$0)'
              : (hasIncludedBase ? `+$${minP} Extra` : `+$${minP}`);
          } else {
            m.subDesc = `+$${minP} ~ $${maxP}`;
          }
        });
      };
      refreshMotorSubDesc(DB.motors, false);
      Object.values(DB.products).forEach(prod => {
        if (prod && prod.motors) {
          refreshMotorSubDesc(prod.motors, Boolean(prod.motorisedPrices || prod.category === 'LOUVRE'));
        }
      });
    }

    function loadCustomDbFromStorage() {
      try {
        const raw = localStorage.getItem(CUSTOM_DB_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        deepMergeDb(DB, parsed);
        if (!parsed.fabricsSchemaVersion) {
          if (DB.fabrics && (!DB.fabrics.ds_95 || !DB.fabrics.viewshade_fg_97 || DB.fabrics.viewshade_fg_95?.rate === 0)) {
            DB.fabrics = JSON.parse(JSON.stringify(DEFAULT_DB_SNAPSHOT.fabrics));
          }
          DB.fabricsSchemaVersion = 2;
        }
        syncSharedOztechRefs();
        const statusEl = document.getElementById('settingsStatusPill');
        if (statusEl) {
          statusEl.textContent = '✓ Custom Price Data Active (Saved in Browser)';
        }
        return true;
      } catch (err) {
        console.warn('Failed to load custom DB from localStorage:', err);
        return false;
      }
    }

    function saveCustomDbToStorage(showMsg = false) {
      try {
        syncSharedOztechRefs();
        localStorage.setItem(CUSTOM_DB_STORAGE_KEY, JSON.stringify(DB));
        const statusEl = document.getElementById('settingsStatusPill');
        if (statusEl) {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          statusEl.textContent = `✓ Auto-Saved (${nowStr})`;
        }
        if (showMsg) {
          alert('✅ Updated price tables saved to browser and applied to the calculator.');
        }
      } catch (err) {
        console.error('Failed to save custom DB:', err);
      }
    }

    function refreshCalculatorFromDb() {
      syncSharedOztechRefs();
      populateFabricOptions();
      populateOperationOptions();
      populateLedOptions();
      populateDimmerOptions();
      populatePowderCoatOptions();
      renderBracketOptions();
      renderSensorOptions();
      renderTable();
      renderBracketReference();
      renderSensorReference();
      renderFabricReference();
      updateInputHints();
      calculatePrice(false);
    }

    const SETTINGS_PW_STORAGE_KEY = 'system_price_calc_admin_pw_v1';
    const DEALER_ACCOUNTS_STORAGE_KEY = 'system_price_calc_dealers_v1';
    let isSettingsUnlocked = false;
    let activeAccessRole = null; // 'admin' | 'dealer' | null
    let activeDealerInfo = null; // { code: '...', name: '...' }
    let dealerAccounts = [];
    let pendingProtectedTargetMode = 'settings';

    function getAdminPassword() {
      return localStorage.getItem(SETTINGS_PW_STORAGE_KEY) || '1234';
    }

    function loadDealersFromLocal() {
      try {
        const raw = localStorage.getItem(DEALER_ACCOUNTS_STORAGE_KEY);
        dealerAccounts = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(dealerAccounts)) dealerAccounts = [];
      } catch (e) {
        dealerAccounts = [];
      }
    }

    function saveDealersToLocal() {
      try {
        localStorage.setItem(DEALER_ACCOUNTS_STORAGE_KEY, JSON.stringify(dealerAccounts));
      } catch (e) {
        console.error('Failed to save dealer accounts locally:', e);
      }
    }

    async function pushDealersAndAuthToCloud() {
      if (!isSupabaseConfigured()) return;
      try {
        await supabaseFetch('app_settings?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            id: 'dealer_accounts_v1',
            payload: {
              masterPw: getAdminPassword(),
              dealers: dealerAccounts
            },
            updated_at: new Date().toISOString()
          })
        });
      } catch (e) {
        console.warn('Could not sync dealer accounts to cloud:', e);
      }
    }

    async function pullDealersAndAuthFromCloud() {
      if (!isSupabaseConfigured()) return;
      try {
        const rows = await supabaseFetch('app_settings?id=eq.dealer_accounts_v1&select=*');
        if (Array.isArray(rows) && rows.length > 0 && rows[0].payload) {
          const p = rows[0].payload;
          if (Array.isArray(p.dealers)) {
            dealerAccounts = p.dealers;
            saveDealersToLocal();
          }
          if (p.masterPw && typeof p.masterPw === 'string') {
            localStorage.setItem(SETTINGS_PW_STORAGE_KEY, p.masterPw);
          }
        }
      } catch (e) {
        console.warn('Could not pull dealer accounts from cloud:', e);
      }
    }

    function resolveAccessCode(rawInput) {
      const entered = String(rawInput || '').trim();
      if (!entered) return null;
      if (entered === getAdminPassword()) {
        return { role: 'admin', code: 'ADMIN', name: 'HQ Master Admin' };
      }
      const matchedDealer = dealerAccounts.find(
        d => String(d.code || '').trim().toLowerCase() === entered.toLowerCase()
      );
      if (matchedDealer) {
        return { role: 'dealer', code: matchedDealer.code, name: matchedDealer.name };
      }
      return null;
    }

    function openSettingsPasswordModal(targetMode = 'settings') {
      pendingProtectedTargetMode = targetMode;
      const modal = document.getElementById('settingsPasswordModal');
      const titleEl = document.getElementById('settingsPwModalTitle');
      const descEl = document.getElementById('settingsPwModalDesc');
      const labelEl = document.getElementById('settingsPasswordInputLabel');
      const inp = document.getElementById('settingsPasswordInput');
      const err = document.getElementById('settingsPwErrorMsg');

      if (targetMode === 'settings') {
        if (titleEl) titleEl.textContent = '🔒 Master Admin Password Required';
        if (descEl) {
          descEl.innerHTML = `Only the <strong>Master Admin Password</strong> can unlock Price Settings & Dealer Code Management.<br><span style="font-size: 0.74rem; color: #64748b;">(Dealer access codes cannot open Price Settings)</span>`;
        }
        if (labelEl) labelEl.textContent = 'Master Admin Password';
        if (inp) inp.placeholder = 'Enter Master Admin password';
      } else {
        if (titleEl) titleEl.textContent = '🔒 Company Access Code Required';
        if (descEl) {
          descEl.innerHTML = `Enter your assigned <strong>Dealer Access Code</strong> to view your company's quotes, or enter the <strong>Master Admin Password</strong>.<br><span style="font-size: 0.74rem; color: #64748b;">(Each dealer can only view their own company's saved quotes)</span>`;
        }
        if (labelEl) labelEl.textContent = 'Dealer Access Code / Admin Password';
        if (inp) inp.placeholder = 'Enter dealer code or admin password';
      }

      if (err) err.style.display = 'none';
      if (inp) inp.value = '';
      if (modal) modal.classList.add('open');
      setTimeout(() => inp?.focus(), 50);
    }

    function closeSettingsPasswordModal() {
      const modal = document.getElementById('settingsPasswordModal');
      if (modal) modal.classList.remove('open');
    }

    async function verifySettingsPassword() {
      const inp = document.getElementById('settingsPasswordInput');
      const err = document.getElementById('settingsPwErrorMsg');
      const entered = inp ? inp.value.trim() : '';

      // Pull latest dealer codes from Supabase first if configured
      if (isSupabaseConfigured()) {
        await pullDealersAndAuthFromCloud();
      }

      const resolved = resolveAccessCode(entered);
      if (!resolved) {
        if (err) {
          err.textContent = '⚠️ Invalid access code or password. Please check with HQ.';
          err.style.display = 'block';
        }
        if (inp) { inp.select(); inp.focus(); }
        return;
      }

      if (pendingProtectedTargetMode === 'settings' && resolved.role !== 'admin') {
        if (err) {
          err.textContent = '⚠️ Dealer codes cannot access Price Settings. Master Admin password is required.';
          err.style.display = 'block';
        }
        if (inp) { inp.select(); inp.focus(); }
        return;
      }

      isSettingsUnlocked = true;
      activeAccessRole = resolved.role;
      activeDealerInfo = { code: resolved.code, name: resolved.name };
      updateQuoteCountBadge();
      closeSettingsPasswordModal();
      switchPageMode(pendingProtectedTargetMode || 'settings', true);
    }

    function switchPageMode(mode, bypassPwCheck = false) {
      const calcView = document.getElementById('calculatorPageView');
      const quotesView = document.getElementById('quotesPageView');
      const settingsView = document.getElementById('settingsPageView');
      const navCalcBtn = document.getElementById('navCalcBtn');
      const navQuotesBtn = document.getElementById('navQuotesBtn');
      const navSettingsBtn = document.getElementById('navSettingsBtn');

      if (mode === 'settings') {
        if (!bypassPwCheck && (!isSettingsUnlocked || activeAccessRole !== 'admin')) {
          openSettingsPasswordModal('settings');
          return;
        }
        calcView.style.display = 'none';
        if (quotesView) quotesView.style.display = 'none';
        settingsView.style.display = 'block';
        navCalcBtn.classList.remove('active');
        if (navQuotesBtn) navQuotesBtn.classList.remove('active');
        navSettingsBtn.classList.add('active');
        renderSettingsEditor();
      } else if (mode === 'quotes') {
        if (!bypassPwCheck && (!isSettingsUnlocked || !activeAccessRole)) {
          openSettingsPasswordModal('quotes');
          return;
        }
        calcView.style.display = 'none';
        if (quotesView) quotesView.style.display = 'block';
        settingsView.style.display = 'none';
        navCalcBtn.classList.remove('active');
        if (navQuotesBtn) navQuotesBtn.classList.add('active');
        navSettingsBtn.classList.remove('active');
        updateQuotesRoleUI();
        renderSavedQuotesList();
        syncQuotesFromSupabase(false);
      } else {
        isSettingsUnlocked = false;
        activeAccessRole = null;
        activeDealerInfo = null;
        updateQuoteCountBadge();
        calcView.style.display = 'block';
        if (quotesView) quotesView.style.display = 'none';
        settingsView.style.display = 'none';
        navCalcBtn.classList.add('active');
        if (navQuotesBtn) navQuotesBtn.classList.remove('active');
        navSettingsBtn.classList.remove('active');
        refreshCalculatorFromDb();
      }
    }

    document.getElementById('navCalcBtn').addEventListener('click', () => switchPageMode('calc'));
    document.getElementById('navQuotesBtn')?.addEventListener('click', () => switchPageMode('quotes'));
    document.getElementById('navSettingsBtn').addEventListener('click', () => switchPageMode('settings'));
    document.getElementById('lockSettingsBtn')?.addEventListener('click', () => switchPageMode('calc'));
    document.getElementById('lockQuotesBtn')?.addEventListener('click', () => switchPageMode('calc'));
    document.getElementById('switchDealerCodeBtn')?.addEventListener('click', () => openSettingsPasswordModal('quotes'));

    document.getElementById('confirmSettingsPwBtn')?.addEventListener('click', verifySettingsPassword);
    document.getElementById('cancelSettingsPwBtn')?.addEventListener('click', closeSettingsPasswordModal);
    document.getElementById('settingsPasswordInput')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifySettingsPassword();
      } else if (e.key === 'Escape') {
        closeSettingsPasswordModal();
      }
    });
    // Only close modal on backdrop click when BOTH pointerdown and click occurred directly on the overlay
    function bindBackdropClose(modalEl, onClose) {
      if (!modalEl) return;
      let startedOnBackdrop = false;
      modalEl.addEventListener('pointerdown', function(e) {
        startedOnBackdrop = (e.target === modalEl);
      });
      modalEl.addEventListener('click', function(e) {
        if (startedOnBackdrop && e.target === modalEl) {
          onClose();
        }
        startedOnBackdrop = false;
      });
    }

    bindBackdropClose(document.getElementById('settingsPasswordModal'), closeSettingsPasswordModal);

    // Change Password Modal Logic
    const changePwModal = document.getElementById('changePasswordModal');
    const changePwErr = document.getElementById('changePwErrorMsg');

    function openChangePwModal() {
      if (changePwErr) changePwErr.style.display = 'none';
      document.getElementById('currentPwInput').value = '';
      document.getElementById('newPwInput').value = '';
      document.getElementById('confirmNewPwInput').value = '';
      if (changePwModal) changePwModal.classList.add('open');
      setTimeout(() => document.getElementById('currentPwInput')?.focus(), 50);
    }

    function closeChangePwModal() {
      if (changePwModal) changePwModal.classList.remove('open');
    }

    document.getElementById('openChangePwModalBtn')?.addEventListener('click', openChangePwModal);
    document.getElementById('cancelChangePwBtn')?.addEventListener('click', closeChangePwModal);
    bindBackdropClose(changePwModal, closeChangePwModal);

    document.getElementById('saveChangePwBtn')?.addEventListener('click', async function() {
      const curPw = document.getElementById('currentPwInput').value;
      const newPw = document.getElementById('newPwInput').value.trim();
      const confPw = document.getElementById('confirmNewPwInput').value.trim();

      if (curPw !== getAdminPassword()) {
        changePwErr.textContent = '⚠️ Current master password is incorrect.';
        changePwErr.style.display = 'block';
        return;
      }
      if (!newPw || newPw.length < 2) {
        changePwErr.textContent = '⚠️ New password must be at least 2 characters.';
        changePwErr.style.display = 'block';
        return;
      }
      if (newPw !== confPw) {
        changePwErr.textContent = '⚠️ New password and confirmation do not match.';
        changePwErr.style.display = 'block';
        return;
      }

      localStorage.setItem(SETTINGS_PW_STORAGE_KEY, newPw);
      await pushDealersAndAuthToCloud();
      closeChangePwModal();
      alert('✅ Master Admin password updated and synced successfully.');
    });

    // Dealer Access Codes Manager Modal Logic (Master Admin)
    let editingDealerIndex = null;

    function renderDealerManagerList() {
      const listEl = document.getElementById('dmDealerListContainer');
      if (!listEl) return;
      if (dealerAccounts.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding: 1.2rem; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 0.78rem;">
          No dealer codes registered yet. Add a company name and access code above.
        </div>`;
        return;
      }
      listEl.innerHTML = dealerAccounts.map((d, idx) => {
        const qCount = savedQuotes.filter(
          q => String(q.form_state?.dealerCode || '').toLowerCase() === String(d.code || '').toLowerCase()
        ).length;

        if (editingDealerIndex === idx) {
          return `<div style="padding:0.65rem 0.75rem; background:#eff6ff; border:1.5px solid #93c5fd; border-radius:8px; font-size:0.78rem;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
              <div>
                <label style="display:block; font-size:0.68rem; font-weight:800; color:#1e3a8a; margin-bottom:0.2rem;">Company / Dealer Name</label>
                <input type="text" id="dmEditNameInput" value="${escapeHtml(d.name)}" style="width:100%; padding:0.38rem 0.55rem; border:1px solid #93c5fd; border-radius:6px; font-size:0.78rem; font-weight:700; background:#fff;" autocomplete="off">
              </div>
              <div>
                <label style="display:block; font-size:0.68rem; font-weight:800; color:#1e3a8a; margin-bottom:0.2rem;">Access Code (Password)</label>
                <input type="text" id="dmEditCodeInput" value="${escapeHtml(d.code)}" style="width:100%; padding:0.38rem 0.55rem; border:1px solid #93c5fd; border-radius:6px; font-size:0.78rem; font-family:monospace; font-weight:800; background:#fff;" autocomplete="off">
              </div>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
              <span style="font-size:0.7rem; color:#1e40af; font-weight:600;">${qCount > 0 ? `ℹ️ ${qCount} saved quote${qCount === 1 ? '' : 's'} will automatically link to the updated code.` : 'Enter new name or access code and click Save.'}</span>
              <div style="display:flex; gap:0.35rem; flex-shrink:0;">
                <button type="button" class="settings-action-btn" data-dm-cancel="${idx}" style="padding:0.26rem 0.55rem; font-size:0.7rem;">Cancel</button>
                <button type="button" class="settings-action-btn primary" data-dm-save="${idx}" style="padding:0.26rem 0.65rem; font-size:0.7rem;">💾 Save</button>
              </div>
            </div>
          </div>`;
        }

        return `<div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; padding:0.5rem 0.7rem; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; font-size:0.78rem;">
          <div>
            <strong style="color:#0f172a;">🏢 ${escapeHtml(d.name)}</strong>
            <span style="margin-left:0.4rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:0.1rem 0.45rem; border-radius:5px; font-family:monospace; font-weight:800;">🔑 ${escapeHtml(d.code)}</span>
            <span style="margin-left:0.35rem; color:#64748b; font-size:0.72rem;">(${qCount} quote${qCount === 1 ? '' : 's'})</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.35rem; flex-shrink:0;">
            <button type="button" class="settings-action-btn" data-dm-edit="${idx}" style="padding:0.25rem 0.55rem; font-size:0.7rem; background:#f8fafc; color:#1d4ed8; border-color:#bfdbfe;">✏️ Edit</button>
            <button type="button" class="settings-action-btn danger" data-dm-del="${idx}" style="padding:0.25rem 0.55rem; font-size:0.7rem;">Delete</button>
          </div>
        </div>`;
      }).join('');

      if (editingDealerIndex !== null) {
        const editCodeEl = document.getElementById('dmEditCodeInput');
        const editNameEl = document.getElementById('dmEditNameInput');
        const onEditKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            saveEditedDealerAccount(editingDealerIndex);
          } else if (e.key === 'Escape') {
            editingDealerIndex = null;
            renderDealerManagerList();
          }
        };
        editCodeEl?.addEventListener('keydown', onEditKey);
        editNameEl?.addEventListener('keydown', onEditKey);
        setTimeout(() => {
          if (editCodeEl) {
            editCodeEl.focus();
            editCodeEl.select();
          }
        }, 30);
      }
    }

    async function saveEditedDealerAccount(idx) {
      const target = dealerAccounts[idx];
      if (!target) return;
      const newName = (document.getElementById('dmEditNameInput')?.value || '').trim();
      const newCode = (document.getElementById('dmEditCodeInput')?.value || '').trim();

      if (!newName || !newCode) {
        alert('Please enter both Company / Dealer Name and Access Code.');
        return;
      }
      if (newCode === getAdminPassword()) {
        alert('⚠️ Dealer Access Code cannot be identical to the Master Admin Password.');
        return;
      }
      const conflict = dealerAccounts.find(
        (d, i) => i !== idx && (d.code.toLowerCase() === newCode.toLowerCase() || d.name.toLowerCase() === newName.toLowerCase())
      );
      if (conflict) {
        alert(`⚠️ Another dealer account already uses that Company Name or Access Code ("${conflict.name}" / "${conflict.code}").`);
        return;
      }

      const oldCode = target.code;
      const oldName = target.name;
      dealerAccounts[idx] = {
        ...target,
        name: newName,
        code: newCode,
        updatedAt: new Date().toISOString()
      };

      // Automatically migrate saved quotes belonging to the old code so no quotes are orphaned
      const migratedQuotes = [];
      if (oldCode.toLowerCase() !== newCode.toLowerCase() || oldName !== newName) {
        savedQuotes.forEach(q => {
          if (q.form_state && String(q.form_state.dealerCode || '').toLowerCase() === oldCode.toLowerCase()) {
            q.form_state.dealerCode = newCode;
            q.form_state.dealerName = newName;
            migratedQuotes.push(q);
          }
        });
        if (migratedQuotes.length > 0) {
          saveQuotesToLocal();
          if (isSupabaseConfigured()) {
            Promise.allSettled(migratedQuotes.map(q => upsertQuoteToSupabase(q)));
          }
        }
        if (activeAccessRole === 'dealer' && activeDealerInfo && activeDealerInfo.code.toLowerCase() === oldCode.toLowerCase()) {
          activeDealerInfo = { name: newName, code: newCode };
        }
      }

      editingDealerIndex = null;
      saveDealersToLocal();
      renderDealerManagerList();
      await pushDealersAndAuthToCloud();
    }

    function openDealerManagerModal() {
      editingDealerIndex = null;
      renderDealerManagerList();
      const nameInp = document.getElementById('dmDealerNameInput');
      const codeInp = document.getElementById('dmDealerCodeInput');
      if (nameInp) nameInp.value = '';
      if (codeInp) codeInp.value = '';
      document.getElementById('dealerManagerModal')?.classList.add('open');
      setTimeout(() => nameInp?.focus(), 50);
    }

    function closeDealerManagerModal() {
      editingDealerIndex = null;
      document.getElementById('dealerManagerModal')?.classList.remove('open');
    }

    document.getElementById('openDealerManagerModalBtn')?.addEventListener('click', openDealerManagerModal);
    document.getElementById('closeDealerManagerBtn')?.addEventListener('click', closeDealerManagerModal);
    bindBackdropClose(document.getElementById('dealerManagerModal'), closeDealerManagerModal);

    document.getElementById('dmAddDealerBtn')?.addEventListener('click', async function() {
      const nameInp = document.getElementById('dmDealerNameInput');
      const codeInp = document.getElementById('dmDealerCodeInput');
      const name = (nameInp?.value || '').trim();
      const code = (codeInp?.value || '').trim();

      if (!name || !code) {
        alert('Please enter both Company / Dealer Name and Access Code.');
        return;
      }
      if (code === getAdminPassword()) {
        alert('⚠️ Dealer Access Code cannot be identical to the Master Admin Password.');
        return;
      }

      const existingIdx = dealerAccounts.findIndex(
        d => d.code.toLowerCase() === code.toLowerCase() || d.name.toLowerCase() === name.toLowerCase()
      );
      if (existingIdx !== -1) {
        editingDealerIndex = existingIdx;
        renderDealerManagerList();
        alert(`ℹ️ "${dealerAccounts[existingIdx].name}" is already registered. Edit its name or access code directly in the highlighted row below and click [💾 Save].`);
        return;
      }

      dealerAccounts.push({ name, code, createdAt: new Date().toISOString() });
      editingDealerIndex = null;
      saveDealersToLocal();
      renderDealerManagerList();
      await pushDealersAndAuthToCloud();
      if (nameInp) nameInp.value = '';
      if (codeInp) codeInp.value = '';
    });

    document.getElementById('dmDealerListContainer')?.addEventListener('click', async function(e) {
      const editBtn = e.target.closest('button[data-dm-edit]');
      if (editBtn) {
        editingDealerIndex = parseInt(editBtn.dataset.dmEdit, 10);
        renderDealerManagerList();
        return;
      }
      const cancelBtn = e.target.closest('button[data-dm-cancel]');
      if (cancelBtn) {
        editingDealerIndex = null;
        renderDealerManagerList();
        return;
      }
      const saveBtn = e.target.closest('button[data-dm-save]');
      if (saveBtn) {
        await saveEditedDealerAccount(parseInt(saveBtn.dataset.dmSave, 10));
        return;
      }
      const btn = e.target.closest('button[data-dm-del]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.dmDel, 10);
      const target = dealerAccounts[idx];
      if (!target) return;
      if (!confirm(`Remove dealer access code "${target.code}" for "${target.name}"?`)) return;
      if (editingDealerIndex === idx) editingDealerIndex = null;
      dealerAccounts.splice(idx, 1);
      saveDealersToLocal();
      renderDealerManagerList();
      await pushDealersAndAuthToCloud();
    });

    function populateSettingsFilters() {
      const modelSelect = document.getElementById('settingsModelSelect');
      const typeSelect = document.getElementById('settingsTableTypeSelect');
      const modelGroup = document.getElementById('settingsModelGroup');
      modelSelect.innerHTML = '';
      typeSelect.innerHTML = '';

      if (activeSettingsCategory === 'FAA') {
        modelGroup.style.display = 'block';
        const faaKeys = ['titan_open', 'titan_trendy', 'family_complete', 'family_flex', 'family_basic', 'family_kompakt_c', 'millennium'];
        faaKeys.forEach(k => {
          if (DB.products[k]) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = DB.products[k].name;
            modelSelect.appendChild(opt);
          }
        });
      } else if (activeSettingsCategory === 'DROP A') {
        modelGroup.style.display = 'block';
        Object.entries(DB.dropAModels).forEach(([grp, list]) => {
          list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = `${grp} - ${item.name}`;
            modelSelect.appendChild(opt);
          });
        });
      } else if (activeSettingsCategory === 'OZTECH') {
        modelGroup.style.display = 'block';
        Object.entries(DB.oztechModels).forEach(([grp, list]) => {
          list.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.key;
            opt.textContent = `${grp} — ${item.name}`;
            modelSelect.appendChild(opt);
          });
        });
      } else if (activeSettingsCategory === 'LOUVRE') {
        modelGroup.style.display = 'block';
        ['grand_louvre', 'louvre_flex'].forEach(k => {
          if (DB.products[k]) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = DB.products[k].name;
            modelSelect.appendChild(opt);
          }
        });
      } else if (activeSettingsCategory === 'COMMON') {
        modelGroup.style.display = 'none';
      }

      populateSettingsTableTypes();
    }

    function populateSettingsTableTypes() {
      const modelKey = document.getElementById('settingsModelSelect').value;
      const typeSelect = document.getElementById('settingsTableTypeSelect');
      const prevVal = typeSelect.value;
      typeSelect.innerHTML = '';
      const product = DB.products[modelKey];

      let options = [];
      if (activeSettingsCategory === 'FAA') {
        options.push({ value: 'complete', label: '1. Complete System Base Matrix (Projection × Width)' });
        options.push({ value: 'kit', label: '2. KIT Only Base Matrix (Projection × Width)' });
        options.push({ value: 'powderCoat', label: '3. Powder Coat Prices (Standard / Non-Standard by Width)' });
        if (product && product.fabricTray) {
          options.push({ value: 'fabricTray', label: '4. Fabric Tray Prices (by Width)' });
        }
        options.push({ value: 'faaMotors', label: '5. Shared FAA Motor Prices (ACE / Alpha / Becker / Somfy)' });
        options.push({ value: 'faaLed', label: '6. Shared FAA LED Prices (ARM LED / Maxi LED)' });
        options.push({ value: 'fabrics', label: '7. Shared FAA / DROP A Fabrics — Add / Edit / Delete ($/sqm)' });
      } else if (activeSettingsCategory === 'DROP A') {
        options.push({ value: 'prices', label: '1. Manual Gear Base Matrix (Drop × Width)' });
        if (product && product.springPrices) {
          options.push({ value: 'springPrices', label: '2. Spring Operation Matrix (Drop × Width)' });
        }
        if (product && product.motorisedPrices) {
          options.push({ value: 'motorisedPrices', label: '3. Motorised (ACE Included) Matrix (Drop × Width)' });
        }
        if (product && product.motors) {
          options.push({ value: 'dropAMotors', label: '4. Model Motor Prices (by Width)' });
        }
        if (product && product.powderCoat) {
          options.push({ value: 'dropAPowderCoat', label: '5. Powder Coat Prices / Multiplier Rates' });
        }
        options.push({ value: 'fabrics', label: '6. Shared DROP A / FAA Fabrics — Add / Edit / Delete ($/sqm)' });
      } else if (activeSettingsCategory === 'OZTECH') {
        options.push({ value: 'single', label: '1. SINGLE MODULE (1BAY) Matrix (Projection × Width)' });
        options.push({ value: 'double', label: '2. DOUBLE MODULE (2BAY) Matrix (Projection × Width)' });
        options.push({ value: 'triple', label: '3. TRIPLE MODULE (3BAY) Matrix (Projection × Width)' });
        if (product && product.additionalRafter) {
          options.push({ value: 'additionalRafter', label: '4. PLAZA Additional Rafter Prices (by Projection)' });
        }
        options.push({ value: 'oztechFullPc', label: '5. Shared OZTECH FULL Powder Coat Matrix & Duratec Rate' });
        options.push({ value: 'oztechUniled', label: '6. Shared OZTECH Standard LED (UNILED) Matrix & Dimmer' });
        options.push({ value: 'oztechMaxiLed', label: '7. Shared OZTECH MAXI LED Matrix & Dimmer' });
        options.push({ value: 'oztechGutterLed', label: '8. Shared OZTECH Full Width LED Gutter Prices' });
        options.push({ value: 'oztechFabrics', label: '9. Shared OZTECH Roof Fabrics — Add / Edit / Delete ($/sqm & mm)' });
        options.push({ value: 'oztechBrackets', label: '10. Shared OZTECH / FAA Rafter Brackets (10° / 22° / Roof Tile Set)' });
      } else if (activeSettingsCategory === 'LOUVRE') {
        options.push({ value: 'prices', label: '1. Louvre Base System Matrix (Projection × Width)' });
        options.push({ value: 'ledPrices', label: '2. Gutter LED Matrix (Projection × Width)' });
        options.push({ value: 'louvreMotors', label: '3. Louvre Motor Surcharges' });
      } else if (activeSettingsCategory === 'COMMON') {
        options = [
          { value: 'fabrics', label: '1. FAA / DROP A Fabrics — Add / Edit / Delete ($/sqm)' },
          { value: 'oztechFabrics', label: '2. OZTECH Roof Fabrics — Add / Edit / Delete ($/sqm & mm)' },
          { value: 'sensorAndRemotes', label: '3. Sensors & Remotes by Motor Brand' },
          { value: 'bracketsAndExtras', label: '4. FAA / OZTECH Brackets & Hardware Extras' },
          { value: 'geniusBrackets', label: '5. DROP A (GENIUS) Brackets' }
        ];
      }

      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        typeSelect.appendChild(opt);
      });

      if (options.some(o => o.value === prevVal)) {
        typeSelect.value = prevVal;
      }
    }

    // Render 2D Matrix Table Editor (rows = projections, cols = widths, matrixObj[proj][width])
    function buildMatrixEditorHtml(title, meta, rows, cols, matrixObj, rowUnitLabel = 'Projection \\ Width') {
      document.getElementById('settingsActiveTableTitle').textContent = title;
      document.getElementById('settingsActiveTableMeta').textContent = meta;

      if (!matrixObj) {
        return `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No table data available for this selection.</div>`;
      }

      let html = `<table class="editable-matrix-table"><thead><tr><th>${rowUnitLabel}</th>`;
      cols.forEach(w => {
        html += `<th>${w.toLocaleString()} mm<br><span style="font-size:0.68rem; font-weight:500; opacity:0.8;">(${(w / 1000).toFixed(1)}M)</span></th>`;
      });
      html += `</tr></thead><tbody>`;

      rows.forEach(p => {
        const rowData = matrixObj[p] || {};
        html += `<tr><td class="row-label-cell">${p.toLocaleString()} mm (${(p / 1000).toFixed(1)}M)</td>`;
        cols.forEach(w => {
          const val = rowData[w] !== undefined ? rowData[w] : 0;
          html += `<td><input type="number" step="any" class="price-cell-input ${val === 0 ? 'is-zero' : ''}" data-kind="matrix" data-row="${p}" data-col="${w}" value="${val}"></td>`;
        });
        html += `</tr>`;
      });

      html += `</tbody></table>`;
      return html;
    }

    function renderFabricManagerEditor(isOztech) {
      const container = document.getElementById('settingsEditorContainer');
      const targetDb = isOztech ? DB.oztechFabrics : DB.fabrics;
      const categories = isOztech
        ? ['Translucent', 'Blockout']
        : ['Shade Mesh', 'Clear PVC', 'Acrylic', 'Canvas'];
      const defaultNewCat = (!isOztech && activeSettingsCategory === 'DROP A') ? 'Shade Mesh' : categories[0];

      document.getElementById('settingsActiveTableTitle').textContent = isOztech
        ? `🧵 OZTECH — Roof Fabrics (Add / Edit / Delete)`
        : `🧵 FAA / DROP A — Fabrics (Add / Edit / Delete)`;
      document.getElementById('settingsActiveTableMeta').textContent = isOztech
        ? `${Object.keys(targetDb).length} fabrics • Edit category, name, width (mm), rate ($/sqm), or add/delete`
        : `${Object.keys(targetDb).length} fabrics • Shade Mesh & Clear PVC apply to FAA + DROP A | Acrylic & Canvas apply to FAA`;

      const catOptionsHtml = categories.map(c =>
        `<option value="${c}" ${c === defaultNewCat ? 'selected' : ''}>${c}</option>`
      ).join('');

      let html = `
        <div style="display:flex; flex-wrap:wrap; gap:0.65rem; align-items:flex-end; padding:0.9rem 1rem; margin-bottom:0.85rem; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px;">
          <div style="display:flex; flex-direction:column; gap:0.25rem; min-width:140px;">
            <label style="font-size:0.72rem; font-weight:700; color:#475569;">Category</label>
            <select id="newFabricCategorySelect" style="padding:0.45rem 0.6rem; border:1px solid #cbd5e1; border-radius:7px; font-size:0.82rem; font-weight:600; background:#fff;">
              ${catOptionsHtml}
            </select>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.25rem; flex:1 1 220px; min-width:180px;">
            <label style="font-size:0.72rem; font-weight:700; color:#475569;">New Fabric Name</label>
            <input type="text" id="newFabricNameInput" placeholder="e.g. Soltis 92 / Custom Mesh" style="padding:0.45rem 0.65rem; border:1px solid #cbd5e1; border-radius:7px; font-size:0.82rem; font-weight:600; background:#fff;">
          </div>
          ${isOztech ? `
          <div style="display:flex; flex-direction:column; gap:0.25rem; width:135px;">
            <label style="font-size:0.72rem; font-weight:700; color:#475569;">Fabric Width (mm)</label>
            <input type="number" id="newFabricWidthInput" step="1" min="100" value="3000" style="padding:0.45rem 0.6rem; border:1px solid #cbd5e1; border-radius:7px; font-size:0.82rem; font-weight:600; background:#fff;">
          </div>` : ''}
          <div style="display:flex; flex-direction:column; gap:0.25rem; width:125px;">
            <label style="font-size:0.72rem; font-weight:700; color:#475569;">Rate ($/sqm)</label>
            <input type="number" id="newFabricRateInput" step="any" value="0" style="padding:0.45rem 0.6rem; border:1px solid #cbd5e1; border-radius:7px; font-size:0.82rem; font-weight:600; background:#fff;">
          </div>
          <button type="button" id="addNewFabricBtn" class="settings-action-btn primary" style="padding:0.48rem 0.95rem; font-size:0.82rem; height:36px;">➕ Add Fabric</button>
        </div>
        <table class="editable-matrix-table">
          <thead>
            <tr>
              <th style="width:160px;">Category</th>
              <th style="text-align:left;">Fabric Name</th>
              ${isOztech ? '<th style="width:150px;">Fabric Width (mm)</th>' : ''}
              <th style="width:140px;">Rate ($/sqm)</th>
              <th style="width:95px;">Action</th>
            </tr>
          </thead>
          <tbody>`;

      Object.entries(targetDb).forEach(([fKey, fObj]) => {
        const rowCatOpts = categories.map(c =>
          `<option value="${c}" ${fObj.category === c ? 'selected' : ''}>${c}</option>`
        ).join('');
        html += `<tr>
          <td style="padding:0.35rem 0.5rem;">
            <select class="fabric-cat-edit" data-fkey="${escapeHtml(fKey)}" style="width:100%; padding:0.36rem 0.45rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; font-weight:600; background:#f8fafc;">
              ${rowCatOpts}
            </select>
          </td>
          <td style="padding:0.35rem 0.5rem; text-align:left;">
            <input type="text" class="fabric-name-edit" data-fkey="${escapeHtml(fKey)}" value="${escapeHtml(fObj.name)}" style="width:100%; padding:0.38rem 0.6rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.83rem; font-weight:600; text-align:left;">
          </td>
          ${isOztech ? `<td><input type="number" step="1" class="price-cell-input" data-fkey="${escapeHtml(fKey)}" data-field="fabricWidth" value="${fObj.fabricWidth}"></td>` : ''}
          <td><input type="number" step="any" class="price-cell-input" data-fkey="${escapeHtml(fKey)}" data-field="rate" value="${fObj.rate}"></td>
          <td style="text-align:center; padding:0.35rem 0.5rem;">
            <button type="button" class="settings-action-btn danger fabric-delete-btn" data-fkey="${escapeHtml(fKey)}" style="padding:0.3rem 0.55rem; font-size:0.74rem;">🗑️ Delete</button>
          </td>
        </tr>`;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;

      const handleAddFabric = () => {
        const cat = document.getElementById('newFabricCategorySelect').value;
        const rawName = document.getElementById('newFabricNameInput').value.trim();
        const rateVal = parseFloat(document.getElementById('newFabricRateInput').value);
        const cleanRate = isNaN(rateVal) ? 0 : rateVal;
        if (!rawName) {
          alert('Please enter a fabric name.');
          document.getElementById('newFabricNameInput').focus();
          return;
        }
        const duplicate = Object.values(targetDb).some(f => f.name.trim().toLowerCase() === rawName.toLowerCase());
        if (duplicate) {
          alert(`A fabric named "${rawName}" already exists in this list.`);
          return;
        }
        const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom';
        let newKey = isOztech ? `oz_${slug}` : slug;
        if (targetDb[newKey]) {
          newKey = `${newKey}_${Date.now().toString(36).slice(-4)}`;
        }
        if (isOztech) {
          const wVal = parseInt(document.getElementById('newFabricWidthInput').value, 10);
          targetDb[newKey] = {
            category: cat,
            name: rawName,
            fabricWidth: (!isNaN(wVal) && wVal > 0) ? wVal : 3000,
            rate: cleanRate
          };
        } else {
          targetDb[newKey] = {
            category: cat,
            name: rawName,
            rate: cleanRate
          };
        }
        saveCustomDbToStorage();
        refreshCalculatorFromDb();
        renderSettingsEditor();
      };

      document.getElementById('addNewFabricBtn').addEventListener('click', handleAddFabric);
      document.getElementById('newFabricNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddFabric();
        }
      });

      container.querySelectorAll('.fabric-cat-edit').forEach(sel => {
        sel.addEventListener('change', function() {
          const fKey = this.dataset.fkey;
          const nextCat = this.value;
          const prevCat = targetDb[fKey].category;
          if (!isOztech && (prevCat === 'Shade Mesh' || prevCat === 'Clear PVC') && nextCat !== 'Shade Mesh' && nextCat !== 'Clear PVC') {
            const remainingDropACompat = Object.entries(targetDb).filter(([k, f]) => k !== fKey && (f.category === 'Shade Mesh' || f.category === 'Clear PVC')).length;
            if (remainingDropACompat === 0) {
              alert('At least one Shade Mesh or Clear PVC fabric must remain available for DROP A products.');
              this.value = prevCat;
              return;
            }
          }
          targetDb[fKey].category = nextCat;
          this.style.borderColor = '#2563eb';
          this.style.backgroundColor = '#eff6ff';
          saveCustomDbToStorage();
          refreshCalculatorFromDb();
        });
      });

      container.querySelectorAll('.fabric-name-edit').forEach(inp => {
        inp.addEventListener('input', function() {
          const fKey = this.dataset.fkey;
          const trimmed = this.value.trim();
          if (!trimmed) return;
          targetDb[fKey].name = trimmed;
          this.style.borderColor = '#2563eb';
          this.style.backgroundColor = '#eff6ff';
          saveCustomDbToStorage();
          refreshCalculatorFromDb();
        });
        inp.addEventListener('blur', function() {
          const fKey = this.dataset.fkey;
          if (!this.value.trim()) {
            this.value = targetDb[fKey].name;
          }
        });
      });

      container.querySelectorAll('.price-cell-input').forEach(inp => {
        inp.addEventListener('input', function() {
          const fKey = this.dataset.fkey;
          const field = this.dataset.field || 'rate';
          targetDb[fKey][field] = parseFloat(this.value) || 0;
          this.classList.add('is-modified');
          saveCustomDbToStorage();
          refreshCalculatorFromDb();
        });
      });

      container.querySelectorAll('.fabric-delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const fKey = this.dataset.fkey;
          const fObj = targetDb[fKey];
          if (!fObj) return;
          if (Object.keys(targetDb).length <= 1) {
            alert('Cannot delete the last remaining fabric in this list.');
            return;
          }
          if (!isOztech && (fObj.category === 'Shade Mesh' || fObj.category === 'Clear PVC')) {
            const remainingDropACompat = Object.entries(targetDb).filter(([k, f]) => k !== fKey && (f.category === 'Shade Mesh' || f.category === 'Clear PVC')).length;
            if (remainingDropACompat === 0) {
              alert('Cannot delete the last remaining Shade Mesh / Clear PVC fabric needed for DROP A products.');
              return;
            }
          }
          if (!confirm(`Delete fabric "${fObj.name}" (${fObj.category})?`)) return;
          delete targetDb[fKey];
          saveCustomDbToStorage();
          refreshCalculatorFromDb();
          renderSettingsEditor();
        });
      });
    }

    function renderSettingsEditor() {
      const container = document.getElementById('settingsEditorContainer');
      const modelKey = document.getElementById('settingsModelSelect').value;
      const tableType = document.getElementById('settingsTableTypeSelect').value;
      const product = DB.products[modelKey];

      if (tableType === 'fabrics') {
        renderFabricManagerEditor(false);
        return;
      }
      if (tableType === 'oztechFabrics') {
        renderFabricManagerEditor(true);
        return;
      }

      if (activeSettingsCategory === 'FAA' && product) {
        if (tableType === 'complete') {
          container.innerHTML = buildMatrixEditorHtml(
            `📊 ${product.name} — Complete System Price Table`,
            'Unit: AUD ($) • Enter 0 for Unavailable (N/A)',
            product.projections,
            product.widths,
            product.prices
          );
          bindMatrixInputs(product.prices);
          return;
        }
        if (tableType === 'kit') {
          const kw = product.kitWidths || product.widths;
          container.innerHTML = buildMatrixEditorHtml(
            `📊 ${product.name} — KIT Only Price Table`,
            'Unit: AUD ($) • Enter 0 for Unavailable (N/A)',
            product.projections,
            kw,
            product.kitPrices
          );
          bindMatrixInputs(product.kitPrices);
          return;
        }
        if (tableType === 'powderCoat') {
          document.getElementById('settingsActiveTableTitle').textContent = `🎨 ${product.name} — Powder Coat Price Table`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Standard / Non-Standard powder coat prices by width bracket ($)';
          const widths = product.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>Tier \\ Width</th>`;
          widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody>`;
          ['standard', 'non_standard'].forEach(tierKey => {
            const rowObj = product.powderCoat?.[tierKey];
            if (!rowObj) return;
            html += `<tr><td class="row-label-cell">${rowObj.name}</td>`;
            widths.forEach((w, idx) => {
              const val = rowObj.prices[idx] ?? 0;
              html += `<td><input type="number" step="any" class="price-cell-input" data-tier="${tierKey}" data-idx="${idx}" value="${val}"></td>`;
            });
            html += `</tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              const t = this.dataset.tier;
              const i = parseInt(this.dataset.idx, 10);
              const v = parseFloat(this.value) || 0;
              product.powderCoat[t].prices[i] = v;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'fabricTray' && product.fabricTray) {
          document.getElementById('settingsActiveTableTitle').textContent = `🛠️ ${product.name} — Fabric Tray Price Table`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Fabric Tray surcharge by width bracket ($)';
          const widths = product.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>Option \\ Width</th>`;
          widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody><tr><td class="row-label-cell">Fabric Tray ($)</td>`;
          widths.forEach((w, idx) => {
            const val = product.fabricTray[idx] ?? 0;
            html += `<td><input type="number" step="any" class="price-cell-input" data-idx="${idx}" value="${val}"></td>`;
          });
          html += `</tr></tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              const i = parseInt(this.dataset.idx, 10);
              product.fabricTray[i] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'faaMotors') {
          document.getElementById('settingsActiveTableTitle').textContent = `⚙️ Shared FAA — Motor Surcharge Table (by Width)`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Motor surcharges across the 11 standard FAA width brackets ($)';
          const stdWidths = DB.products.titan_open.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>Motor Brand \\ Width</th>`;
          stdWidths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody>`;
          Object.entries(DB.motors).forEach(([mKey, mObj]) => {
            html += `<tr><td class="row-label-cell">${mObj.name}</td>`;
            stdWidths.forEach((w, idx) => {
              const val = mObj.prices[idx] ?? 0;
              html += `<td><input type="number" step="any" class="price-cell-input" data-mkey="${mKey}" data-idx="${idx}" value="${val}"></td>`;
            });
            html += `</tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              const mKey = this.dataset.mkey;
              const idx = parseInt(this.dataset.idx, 10);
              DB.motors[mKey].prices[idx] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'faaLed') {
          document.getElementById('settingsActiveTableTitle').textContent = `💡 Shared FAA — LED Lighting Price Table (by Width)`;
          document.getElementById('settingsActiveTableMeta').textContent = 'ARM LED / Maxi LED prices across the 11 standard FAA width brackets ($)';
          const stdWidths = DB.products.titan_open.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>LED & Motor \\ Width</th>`;
          stdWidths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody>`;
          Object.entries(DB.ledLighting).forEach(([ledKey, ledObj]) => {
            Object.entries(ledObj.rows).forEach(([mKey, rowObj]) => {
              html += `<tr><td class="row-label-cell">${rowObj.label}</td>`;
              stdWidths.forEach((w, idx) => {
                const val = rowObj.prices[idx] ?? 0;
                html += `<td><input type="number" step="any" class="price-cell-input ${val === 0 ? 'is-zero' : ''}" data-led="${ledKey}" data-motor="${mKey}" data-idx="${idx}" value="${val}"></td>`;
              });
              html += `</tr>`;
            });
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              const lKey = this.dataset.led;
              const mKey = this.dataset.motor;
              const idx = parseInt(this.dataset.idx, 10);
              const v = parseFloat(this.value) || 0;
              DB.ledLighting[lKey].rows[mKey].prices[idx] = v;
              this.classList.toggle('is-zero', v === 0);
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
      }

      if (activeSettingsCategory === 'DROP A' && product) {
        if (tableType === 'prices' || tableType === 'springPrices' || tableType === 'motorisedPrices') {
          const mat = product[tableType];
          const labelMap = {
            prices: 'Manual Gear Base Matrix',
            springPrices: 'Spring Operation Matrix',
            motorisedPrices: 'Motorised (ACE Included) Matrix'
          };
          container.innerHTML = buildMatrixEditorHtml(
            `📊 ${product.name} — ${labelMap[tableType]}`,
            'Unit: AUD ($) • Rows: Drop (mm) / Cols: Width (mm)',
            product.projections,
            product.widths,
            mat,
            'Drop \\ Width'
          );
          bindMatrixInputs(mat);
          return;
        }
        if (tableType === 'dropAMotors' && product.motors) {
          document.getElementById('settingsActiveTableTitle').textContent = `⚙️ ${product.name} — Motor Prices`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Motor surcharges by brand and width bracket ($)';
          const widths = product.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>Motor Brand</th>`;
          widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody>`;
          Object.entries(product.motors).forEach(([mKey, mObj]) => {
            html += `<tr><td class="row-label-cell">${mObj.name}</td>`;
            widths.forEach((w, idx) => {
              const val = mObj.prices[idx] ?? 0;
              html += `<td><input type="number" step="any" class="price-cell-input" data-mkey="${mKey}" data-idx="${idx}" value="${val}"></td>`;
            });
            html += `</tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              const mKey = this.dataset.mkey;
              const idx = parseInt(this.dataset.idx, 10);
              product.motors[mKey].prices[idx] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'dropAPowderCoat' && product.powderCoat) {
          document.getElementById('settingsActiveTableTitle').textContent = `🎨 ${product.name} — Powder Coat Settings`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Powder coat flat prices or Base multiplier rates';
          if (product.powderCoat.mode === 'multiplier') {
            let html = `<table class="editable-matrix-table"><thead><tr><th>Option Key</th><th>Label</th><th>Multiplier Rate (Base × Rate)</th></tr></thead><tbody>`;
            Object.entries(product.powderCoat.options).forEach(([k, optObj]) => {
              html += `<tr>
                <td class="row-label-cell">${k}</td>
                <td style="text-align:left; padding:0.4rem 0.7rem;">${optObj.label}</td>
                <td><input type="number" step="0.001" class="price-cell-input" style="width:110px !important;" data-opt="${k}" value="${optObj.rate}"></td>
              </tr>`;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;
            container.querySelectorAll('.price-cell-input').forEach(inp => {
              inp.addEventListener('input', function() {
                const k = this.dataset.opt;
                product.powderCoat.options[k].rate = parseFloat(this.value) || 0;
                this.classList.add('is-modified');
                saveCustomDbToStorage();
                refreshCalculatorFromDb();
              });
            });
          } else {
            const widths = product.widths;
            let html = `<table class="editable-matrix-table"><thead><tr><th>Tier \\ Width</th>`;
            widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
            html += `</tr></thead><tbody>`;
            ['standard', 'non_standard'].forEach(tKey => {
              const rowObj = product.powderCoat[tKey];
              if (!rowObj) return;
              html += `<tr><td class="row-label-cell">${rowObj.name}</td>`;
              widths.forEach((w, idx) => {
                const val = rowObj.prices[idx] ?? 0;
                html += `<td><input type="number" step="any" class="price-cell-input" data-tier="${tKey}" data-idx="${idx}" value="${val}"></td>`;
              });
              html += `</tr>`;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;
            container.querySelectorAll('.price-cell-input').forEach(inp => {
              inp.addEventListener('input', function() {
                product.powderCoat[this.dataset.tier].prices[parseInt(this.dataset.idx, 10)] = parseFloat(this.value) || 0;
                this.classList.add('is-modified');
                saveCustomDbToStorage();
                refreshCalculatorFromDb();
              });
            });
          }
          return;
        }
      }

      if (activeSettingsCategory === 'OZTECH' && product) {
        if (tableType === 'single' || tableType === 'double' || tableType === 'triple') {
          const modCfg = (product.moduleConfig && product.moduleConfig[tableType]) ? product.moduleConfig[tableType] : DB.oztechModules[tableType];
          const cols = [...(modCfg.widths || []), ...(modCfg.overhangWidths || [])];
          const mat = product.modulePrices ? product.modulePrices[tableType] : null;
          container.innerHTML = buildMatrixEditorHtml(
            `📊 ${product.name} — ${modCfg.label} Price Table`,
            `Unit: AUD ($) • Rows: Projection (mm) / Cols: Width (mm)${modelKey === 'oztech_izi_slope_standard' ? ' • (Shared matrix with IZI)' : ''}`,
            product.projections,
            cols,
            mat
          );
          bindMatrixInputs(mat);
          return;
        }
        if (tableType === 'additionalRafter' && product.additionalRafter) {
          document.getElementById('settingsActiveTableTitle').textContent = `🔩 ${product.name} — Additional Rafter Price Table`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Additional Rafter unit price by Projection ($)';
          let html = `<table class="editable-matrix-table"><thead><tr><th>Projection (mm)</th><th>Additional Rafter Price ($)</th></tr></thead><tbody>`;
          Object.keys(product.additionalRafter).forEach(proj => {
            const val = product.additionalRafter[proj];
            html += `<tr>
              <td class="row-label-cell">${Number(proj).toLocaleString()} mm</td>
              <td><input type="number" step="any" class="price-cell-input" data-proj="${proj}" value="${val}"></td>
            </tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              product.additionalRafter[this.dataset.proj] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'oztechFullPc') {
          const pcDb = DB.oztechFullPowderCoat;
          let html = `<div style="padding: 0.75rem 1rem; background:#eff6ff; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.75rem;">
            <strong style="font-size:0.82rem;">Duratec Surcharge Rate (Base × Rate):</strong>
            <input type="number" step="0.001" id="ozDuratecRateInput" class="price-cell-input" style="width:100px !important;" value="${pcDb.duratecRate}">
            <span style="font-size:0.76rem; color:var(--text-muted);">(Default: 0.128 = 12.8%)</span>
          </div>`;
          html += buildMatrixEditorHtml(
            `🎨 Shared OZTECH — FULL Powder Coating Price Table`,
            'FULL powder coating surcharge by dimensions ($)',
            pcDb.projections,
            pcDb.widths,
            pcDb.prices
          );
          container.innerHTML = html;
          document.getElementById('ozDuratecRateInput')?.addEventListener('input', function() {
            pcDb.duratecRate = parseFloat(this.value) || 0;
            this.classList.add('is-modified');
            saveCustomDbToStorage();
            refreshCalculatorFromDb();
          });
          bindMatrixInputs(pcDb.prices);
          return;
        }
        if (tableType === 'oztechUniled' || tableType === 'oztechMaxiLed') {
          const ledKey = tableType === 'oztechUniled' ? 'uniled' : 'maxi_led';
          const ledDb = DB.oztechLedLighting[ledKey];
          let html = `<div style="padding: 0.75rem 1rem; background:#eff6ff; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.75rem;">
            <strong style="font-size:0.82rem;">Optional Remote Dimming Control Price ($):</strong>
            <input type="number" step="any" id="ozLedDimmerPriceInput" class="price-cell-input" style="width:100px !important;" value="${ledDb.dimmerPrice}">
            <span style="font-size:0.76rem; color:var(--text-muted);">(${ledDb.dimmerNote})</span>
          </div>`;
          html += buildMatrixEditorHtml(
            `💡 Shared OZTECH — ${ledDb.name} Price Table`,
            'Unit: AUD ($) • Enter 0 for Unavailable (N/A)',
            DB.oztechLedLighting.projections,
            DB.oztechLedLighting.widths,
            ledDb.prices
          );
          container.innerHTML = html;
          document.getElementById('ozLedDimmerPriceInput')?.addEventListener('input', function() {
            ledDb.dimmerPrice = parseFloat(this.value) || 0;
            this.classList.add('is-modified');
            saveCustomDbToStorage();
            refreshCalculatorFromDb();
          });
          bindMatrixInputs(ledDb.prices);
          return;
        }
        if (tableType === 'oztechGutterLed') {
          const gDb = DB.oztechLedLighting.gutter_led;
          document.getElementById('settingsActiveTableTitle').textContent = `💡 Shared OZTECH — Full Width LED Gutter Price Table`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Gutter LED surcharge by width bracket ($)';
          let html = `<table class="editable-matrix-table"><thead><tr><th>Option \\ Width</th>`;
          DB.oztechLedLighting.widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody><tr><td class="row-label-cell">Full Width LED Gutter ($)</td>`;
          DB.oztechLedLighting.widths.forEach(w => {
            const val = gDb.pricesByWidth[w] ?? 0;
            html += `<td><input type="number" step="any" class="price-cell-input" data-w="${w}" value="${val}"></td>`;
          });
          html += `</tr></tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              gDb.pricesByWidth[this.dataset.w] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'oztechBrackets') {
          document.getElementById('settingsActiveTableTitle').textContent = `🔩 OZTECH — Additional Rafter Brackets & Sets`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Shared with FAA Brackets & Hardware Extras • Unit: AUD ($)';
          let html = `<table class="editable-matrix-table"><thead><tr><th>ID</th><th>Bracket / Extra Name</th><th>Unit Price ($)</th></tr></thead><tbody>`;
          OZTECH_BRACKET_IDS.forEach(bId => {
            const idx = DB.bracketsAndExtras.findIndex(b => b.id === bId);
            if (idx === -1) return;
            const item = DB.bracketsAndExtras[idx];
            html += `<tr>
              <td class="row-label-cell">${item.id}</td>
              <td style="text-align:left; padding:0.4rem 0.75rem; font-weight:600;">${item.name}</td>
              <td><input type="number" step="any" class="price-cell-input" data-idx="${idx}" value="${item.price}"></td>
            </tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              DB.bracketsAndExtras[parseInt(this.dataset.idx, 10)].price = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
      }

      if (activeSettingsCategory === 'LOUVRE' && product) {
        if (tableType === 'prices') {
          container.innerHTML = buildMatrixEditorHtml(
            `📊 ${product.name} — System Base Price Table`,
            'Unit: AUD ($) • Rows: Projection (mm) / Cols: Width (mm)',
            product.projections,
            product.widths,
            product.prices
          );
          bindMatrixInputs(product.prices);
          return;
        }
        if (tableType === 'ledPrices') {
          const lw = product.ledWidths || product.widths;
          const lp = Object.keys(product.ledPrices || {}).map(Number).sort((a, b) => a - b);
          container.innerHTML = buildMatrixEditorHtml(
            `💡 ${product.name} — Gutter LED Price Table`,
            'Unit: AUD ($)',
            lp,
            lw,
            product.ledPrices
          );
          bindMatrixInputs(product.ledPrices);
          return;
        }
        if (tableType === 'louvreMotors' && product.motors) {
          document.getElementById('settingsActiveTableTitle').textContent = `⚙️ ${product.name} — Motor Prices`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Motor surcharges by brand and width bracket ($)';
          const widths = product.widths;
          let html = `<table class="editable-matrix-table"><thead><tr><th>Motor Brand</th>`;
          widths.forEach(w => { html += `<th>${w.toLocaleString()} mm</th>`; });
          html += `</tr></thead><tbody>`;
          Object.entries(product.motors).forEach(([mKey, mObj]) => {
            html += `<tr><td class="row-label-cell">${mObj.name}</td>`;
            widths.forEach((w, idx) => {
              const val = mObj.prices[idx] ?? 0;
              html += `<td><input type="number" step="any" class="price-cell-input" data-mkey="${mKey}" data-idx="${idx}" value="${val}"></td>`;
            });
            html += `</tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              product.motors[this.dataset.mkey].prices[parseInt(this.dataset.idx, 10)] = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
      }

      if (activeSettingsCategory === 'COMMON') {
        if (tableType === 'sensorAndRemotes') {
          document.getElementById('settingsActiveTableTitle').textContent = `📡 Sensors & Remotes by Motor Brand`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Unit: AUD ($)';
          let html = `<table class="editable-matrix-table"><thead><tr><th>Motor Brand</th><th>Item Name</th><th>Price ($)</th></tr></thead><tbody>`;
          Object.entries(DB.sensorAndRemotes).forEach(([brand, list]) => {
            list.forEach((item, idx) => {
              html += `<tr>
                <td class="row-label-cell">${brand.toUpperCase()}</td>
                <td style="text-align:left; padding:0.4rem 0.75rem; font-weight:600;">${item.name}</td>
                <td><input type="number" step="any" class="price-cell-input" data-brand="${brand}" data-idx="${idx}" value="${item.price}"></td>
              </tr>`;
            });
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              DB.sensorAndRemotes[this.dataset.brand][parseInt(this.dataset.idx, 10)].price = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
        if (tableType === 'bracketsAndExtras' || tableType === 'geniusBrackets') {
          const targetArr = DB[tableType];
          document.getElementById('settingsActiveTableTitle').textContent = tableType === 'bracketsAndExtras'
            ? `🔩 FAA Brackets & Hardware Extras`
            : `🔩 DROP A (GENIUS) Brackets`;
          document.getElementById('settingsActiveTableMeta').textContent = 'Unit: AUD ($)';
          let html = `<table class="editable-matrix-table"><thead><tr><th>ID</th><th>Bracket / Extra Name</th><th>Unit Price ($)</th></tr></thead><tbody>`;
          targetArr.forEach((item, idx) => {
            html += `<tr>
              <td class="row-label-cell">${item.id}</td>
              <td style="text-align:left; padding:0.4rem 0.75rem; font-weight:600;">${item.name}</td>
              <td><input type="number" step="any" class="price-cell-input" data-idx="${idx}" value="${item.price}"></td>
            </tr>`;
          });
          html += `</tbody></table>`;
          container.innerHTML = html;
          container.querySelectorAll('.price-cell-input').forEach(inp => {
            inp.addEventListener('input', function() {
              targetArr[parseInt(this.dataset.idx, 10)].price = parseFloat(this.value) || 0;
              this.classList.add('is-modified');
              saveCustomDbToStorage();
              refreshCalculatorFromDb();
            });
          });
          return;
        }
      }
    }

    function bindMatrixInputs(matrixObj) {
      if (!matrixObj) return;
      const container = document.getElementById('settingsEditorContainer');
      container.querySelectorAll('.price-cell-input[data-kind="matrix"]').forEach(inp => {
        inp.addEventListener('input', function() {
          const r = this.dataset.row;
          const c = this.dataset.col;
          const val = parseFloat(this.value);
          const cleanVal = isNaN(val) ? 0 : val;
          if (!matrixObj[r]) matrixObj[r] = {};
          matrixObj[r][c] = cleanVal;
          this.classList.toggle('is-zero', cleanVal === 0);
          this.classList.add('is-modified');
          saveCustomDbToStorage();
          refreshCalculatorFromDb();
        });
      });
    }

    // Event Listeners for Settings Page Controls
    document.querySelectorAll('.settings-cat-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        activeSettingsCategory = this.dataset.scat;
        document.querySelectorAll('.settings-cat-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.scat === activeSettingsCategory);
        });
        populateSettingsFilters();
        renderSettingsEditor();
      });
    });

    document.getElementById('settingsModelSelect').addEventListener('change', function() {
      populateSettingsTableTypes();
      renderSettingsEditor();
    });

    document.getElementById('settingsTableTypeSelect').addEventListener('change', function() {
      renderSettingsEditor();
    });

    // Bulk Price Adjust on Active Table
    document.getElementById('applyBulkAdjustBtn').addEventListener('click', function() {
      const mode = document.getElementById('bulkAdjustMode').value;
      const rawVal = parseFloat(document.getElementById('bulkAdjustValue').value);
      if (isNaN(rawVal) || rawVal === 0) {
        alert('Please enter a non-zero percentage (%) or dollar amount ($) to apply.');
        return;
      }
      const inputs = document.querySelectorAll('#settingsEditorContainer .price-cell-input');
      let count = 0;
      inputs.forEach(inp => {
        if (inp.id === 'ozDuratecRateInput' || inp.dataset.field === 'fabricWidth') return;
        const cur = parseFloat(inp.value);
        if (isNaN(cur) || cur === 0) return; // keep 0 (unavailable) cells as 0
        let nextVal = cur;
        if (mode === 'percent') {
          nextVal = Math.round(cur * (1 + rawVal / 100));
        } else {
          nextVal = Math.max(0, Math.round((cur + rawVal) * 100) / 100);
        }
        inp.value = nextVal;
        inp.dispatchEvent(new Event('input'));
        count++;
      });
      alert(`✅ Bulk adjustment applied to ${count} cells in the active table.`);
    });

    // Save Button
    document.getElementById('saveSettingsBtn').addEventListener('click', function() {
      saveCustomDbToStorage(true);
    });

    // =========================================================================
    // 📊 EXCEL (.XLSX) EXPORT & IMPORT FOR ALL PRICE TABLES
    // =========================================================================
    function ensureXlsxLibrary() {
      if (typeof XLSX !== 'undefined') return Promise.resolve(XLSX);
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
        script.onload = () => (typeof XLSX !== 'undefined' ? resolve(XLSX) : reject(new Error('XLSX load failed')));
        script.onerror = () => reject(new Error('Failed to load Excel library. Check your internet connection.'));
        document.head.appendChild(script);
      });
    }

    function appendSheetWithAutoCols(wb, sheetName, aoa) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const colMax = [];
      aoa.forEach(row => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, cIdx) => {
          const len = cell === null || cell === undefined ? 0 : String(cell).length;
          colMax[cIdx] = Math.max(colMax[cIdx] || 10, Math.min(44, len + 3));
        });
      });
      ws['!cols'] = colMax.map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    }

    function pushExcelMatrixBlock(aoa, targetId, title, rows, cols, matrixObj, cornerLabel = 'Projection \\ Width (mm)') {
      if (!matrixObj || !Array.isArray(rows) || !Array.isArray(cols)) return;
      aoa.push(['##TABLE', 'MATRIX', targetId, title]);
      aoa.push([cornerLabel, ...cols]);
      rows.forEach(r => {
        const rowData = matrixObj[r] || {};
        aoa.push([r, ...cols.map(c => (rowData[c] !== undefined ? rowData[c] : 0))]);
      });
      aoa.push([]);
    }

    async function exportPriceDbToExcel() {
      try {
        await ensureXlsxLibrary();
        syncSharedOztechRefs();
        const wb = XLSX.utils.book_new();

        // 0. Guide Sheet
        const guideAoa = [
          ['SYSTEM PRICE CALCULATOR — EXCEL PRICE DATABASE (.XLSX)'],
          ['Exported At', new Date().toLocaleString()],
          [],
          ['HOW TO UPDATE PRICES USING THIS EXCEL FILE'],
          ['1. Select any sheet tab below (FAA, DROP A, OZTECH, LOUVRE, Fabrics, Sensors & Brackets) and edit the price numbers directly.'],
          ['2. Excel formulas (e.g. =C5*1.05) are supported — calculated results will be imported automatically.'],
          ['3. Entering 0 in a size matrix cell marks that Width × Projection combination as Unavailable (N/A).'],
          ['4. In sheet "8_Fabrics", you can EDIT fabric names/categories/rates, ADD new rows at the bottom of a table (leave Fabric Key blank), or DELETE rows.'],
          ['5. IMPORTANT: Do NOT delete or rename rows starting with "##TABLE" or the Key/Width/Projection header labels, as they map each table back to the calculator.'],
          ['6. Save this file (Ctrl+S), then click [📤 Import Excel (.xlsx)] in ⚙️ Price Settings. (If using Supabase Cloud, click [☁️ Push Price Tables to Cloud] afterwards to sync to all dealers.)']
        ];
        appendSheetWithAutoCols(wb, '0_How_To_Use', guideAoa);

        // 1. FAA Complete System Base Matrices
        const faaKeys = ['titan_open', 'titan_trendy', 'family_complete', 'family_flex', 'family_basic', 'family_kompakt_c', 'millennium'];
        const faaCompAoa = [];
        faaKeys.forEach(k => {
          const p = DB.products[k];
          if (p && p.prices) {
            pushExcelMatrixBlock(faaCompAoa, `${k}:prices`, `${p.name} — Complete System Base Matrix ($)`, p.projections, p.widths, p.prices);
          }
        });
        appendSheetWithAutoCols(wb, '1_FAA_Complete', faaCompAoa);

        // 2. FAA KIT & Shared Options
        const faaOptAoa = [];
        faaKeys.forEach(k => {
          const p = DB.products[k];
          if (!p) return;
          if (p.kitPrices) {
            pushExcelMatrixBlock(faaOptAoa, `${k}:kitPrices`, `${p.name} — KIT Only Base Matrix ($)`, p.projections, p.kitWidths || p.widths, p.kitPrices);
          }
          if (p.powderCoat && (p.powderCoat.standard || p.powderCoat.non_standard)) {
            faaOptAoa.push(['##TABLE', 'WIDTH_ROWS', `FAA_PC:${k}`, `${p.name} — Powder Coat Prices by Width ($)`]);
            faaOptAoa.push(['Key (Do Not Edit)', 'Powder Coat Tier', ...p.widths]);
            ['standard', 'non_standard'].forEach(tKey => {
              if (p.powderCoat[tKey]) {
                faaOptAoa.push([tKey, p.powderCoat[tKey].name, ...p.widths.map((_, idx) => p.powderCoat[tKey].prices[idx] ?? 0)]);
              }
            });
            faaOptAoa.push([]);
          }
          if (p.fabricTray) {
            faaOptAoa.push(['##TABLE', 'WIDTH_ROWS', `FAA_TRAY:${k}`, `${p.name} — Fabric Tray Prices by Width ($)`]);
            faaOptAoa.push(['Key (Do Not Edit)', 'Option', ...p.widths]);
            faaOptAoa.push(['fabricTray', 'Fabric Tray ($)', ...p.widths.map((_, idx) => p.fabricTray[idx] ?? 0)]);
            faaOptAoa.push([]);
          }
        });
        const stdFaaWidths = DB.products.titan_open.widths;
        faaOptAoa.push(['##TABLE', 'WIDTH_ROWS', 'FAA_MOTORS', 'Shared FAA — Motor Surcharges by Width ($)']);
        faaOptAoa.push(['Key (Do Not Edit)', 'Motor Brand', ...stdFaaWidths]);
        Object.entries(DB.motors).forEach(([mKey, mObj]) => {
          faaOptAoa.push([mKey, mObj.name, ...stdFaaWidths.map((_, idx) => mObj.prices[idx] ?? 0)]);
        });
        faaOptAoa.push([]);

        faaOptAoa.push(['##TABLE', 'WIDTH_ROWS', 'FAA_LED', 'Shared FAA — LED Lighting Prices by Width ($)']);
        faaOptAoa.push(['Key (Do Not Edit)', 'LED & Motor Option', ...stdFaaWidths]);
        Object.entries(DB.ledLighting).forEach(([ledKey, ledObj]) => {
          Object.entries(ledObj.rows).forEach(([mKey, rowObj]) => {
            faaOptAoa.push([`${ledKey}:${mKey}`, rowObj.label, ...stdFaaWidths.map((_, idx) => rowObj.prices[idx] ?? 0)]);
          });
        });
        faaOptAoa.push([]);
        appendSheetWithAutoCols(wb, '2_FAA_KIT_Options', faaOptAoa);

        // 3. DROP A Models & Options
        const dropAAoa = [];
        Object.entries(DB.dropAModels).forEach(([grp, list]) => {
          list.forEach(item => {
            const k = item.key;
            const p = DB.products[k];
            if (!p) return;
            if (p.prices) {
              pushExcelMatrixBlock(dropAAoa, `${k}:prices`, `${p.name} — Manual Gear Base Matrix ($)`, p.projections, p.widths, p.prices, 'Drop \\ Width (mm)');
            }
            if (p.springPrices) {
              pushExcelMatrixBlock(dropAAoa, `${k}:springPrices`, `${p.name} — Spring Operation Matrix ($)`, p.projections, p.widths, p.springPrices, 'Drop \\ Width (mm)');
            }
            if (p.motorisedPrices) {
              pushExcelMatrixBlock(dropAAoa, `${k}:motorisedPrices`, `${p.name} — Motorised (ACE Included) Matrix ($)`, p.projections, p.widths, p.motorisedPrices, 'Drop \\ Width (mm)');
            }
            if (p.motors) {
              dropAAoa.push(['##TABLE', 'WIDTH_ROWS', `PROD_MOTORS:${k}`, `${p.name} — Motor Prices by Width ($)`]);
              dropAAoa.push(['Key (Do Not Edit)', 'Motor Brand', ...p.widths]);
              Object.entries(p.motors).forEach(([mKey, mObj]) => {
                dropAAoa.push([mKey, mObj.name, ...p.widths.map((_, idx) => mObj.prices[idx] ?? 0)]);
              });
              dropAAoa.push([]);
            }
            if (p.powderCoat) {
              if (p.powderCoat.mode === 'multiplier' && p.powderCoat.options) {
                dropAAoa.push(['##TABLE', 'KEY_VAL', `DROPA_PC_MULT:${k}`, `${p.name} — Powder Coat Multiplier Rates (Base × Rate)`]);
                dropAAoa.push(['Key (Do Not Edit)', 'Option Label', 'Multiplier Rate']);
                Object.entries(p.powderCoat.options).forEach(([optKey, optObj]) => {
                  dropAAoa.push([optKey, optObj.label, optObj.rate]);
                });
                dropAAoa.push([]);
              } else {
                dropAAoa.push(['##TABLE', 'WIDTH_ROWS', `FAA_PC:${k}`, `${p.name} — Powder Coat Prices by Width ($)`]);
                dropAAoa.push(['Key (Do Not Edit)', 'Powder Coat Tier', ...p.widths]);
                ['standard', 'non_standard'].forEach(tKey => {
                  if (p.powderCoat[tKey]) {
                    dropAAoa.push([tKey, p.powderCoat[tKey].name, ...p.widths.map((_, idx) => p.powderCoat[tKey].prices[idx] ?? 0)]);
                  }
                });
                dropAAoa.push([]);
              }
            }
          });
        });
        appendSheetWithAutoCols(wb, '3_DROP_A', dropAAoa);

        // 4 & 5. OZTECH Base Module Matrices (1Bay on Sheet 4; 2Bay, 3Bay & Rafters on Sheet 5)
        const oz1Aoa = [];
        const oz23Aoa = [];
        Object.entries(DB.oztechModels).forEach(([, list]) => {
          list.forEach(item => {
            const k = item.key;
            if (k === 'oztech_izi_slope_standard') return; // Shares modulePrices with oztech_izi_standard
            const p = DB.products[k];
            if (!p || !p.modulePrices) return;
            const sharedNote = k === 'oztech_izi_standard' ? ' (Also shared with IZI SLOPE)' : '';
            ['single', 'double', 'triple'].forEach(modKey => {
              const mat = p.modulePrices[modKey];
              if (!mat) return;
              const modCfg = (p.moduleConfig && p.moduleConfig[modKey]) ? p.moduleConfig[modKey] : DB.oztechModules[modKey];
              const cols = [...(modCfg.widths || []), ...(modCfg.overhangWidths || [])];
              const targetAoa = modKey === 'single' ? oz1Aoa : oz23Aoa;
              pushExcelMatrixBlock(targetAoa, `${k}:oz_${modKey}`, `${p.name} — ${modCfg.label}${sharedNote} ($)`, p.projections, cols, mat);
            });
            if (p.additionalRafter) {
              oz23Aoa.push(['##TABLE', 'KEY_VAL', `OZTECH_RAFTER:${k}`, `${p.name} — PLAZA Additional Rafter Price by Projection ($)`]);
              oz23Aoa.push(['Key (Projection mm)', 'Projection', 'Additional Rafter Price ($)']);
              Object.entries(p.additionalRafter).forEach(([proj, val]) => {
                oz23Aoa.push([Number(proj), `${Number(proj).toLocaleString()} mm`, val]);
              });
              oz23Aoa.push([]);
            }
          });
        });
        appendSheetWithAutoCols(wb, '4_OZTECH_1Bay', oz1Aoa);
        appendSheetWithAutoCols(wb, '5_OZTECH_2Bay_3Bay', oz23Aoa);

        // 6. OZTECH Shared Options (Powder Coat, UNILED, MAXI LED, Gutter LED)
        const ozOptAoa = [];
        ozOptAoa.push(['##TABLE', 'KEY_VAL', 'OZTECH_SCALARS', 'Shared OZTECH — Duratec Rate & LED Dimmer Prices']);
        ozOptAoa.push(['Key (Do Not Edit)', 'Option Description', 'Rate / Price']);
        ozOptAoa.push(['duratecRate', 'OZTECH Duratec Surcharge Multiplier Rate (0.128 = 12.8%)', DB.oztechFullPowderCoat.duratecRate]);
        ozOptAoa.push(['uniledDimmer', 'Standard LED (UNILED) Remote Dimmer Price ($)', DB.oztechLedLighting.uniled.dimmerPrice]);
        ozOptAoa.push(['maxiLedDimmer', 'MAXI LED Remote Dimmer Price ($)', DB.oztechLedLighting.maxi_led.dimmerPrice]);
        ozOptAoa.push([]);

        pushExcelMatrixBlock(ozOptAoa, 'OZTECH_FULL_PC', 'Shared OZTECH — FULL Powder Coating Price Matrix ($)', DB.oztechFullPowderCoat.projections, DB.oztechFullPowderCoat.widths, DB.oztechFullPowderCoat.prices);
        pushExcelMatrixBlock(ozOptAoa, 'OZTECH_UNILED', 'Shared OZTECH — Standard LED (UNILED) Price Matrix ($)', DB.oztechLedLighting.projections, DB.oztechLedLighting.widths, DB.oztechLedLighting.uniled.prices);
        pushExcelMatrixBlock(ozOptAoa, 'OZTECH_MAXI_LED', 'Shared OZTECH — MAXI LED Price Matrix ($)', DB.oztechLedLighting.projections, DB.oztechLedLighting.widths, DB.oztechLedLighting.maxi_led.prices);

        ozOptAoa.push(['##TABLE', 'WIDTH_ROWS', 'OZTECH_GUTTER_LED', 'Shared OZTECH — Full Width LED Gutter Prices ($)']);
        ozOptAoa.push(['Key (Do Not Edit)', 'Option', ...DB.oztechLedLighting.widths]);
        ozOptAoa.push(['gutter_led', 'Full Width LED Gutter ($)', ...DB.oztechLedLighting.widths.map(w => DB.oztechLedLighting.gutter_led.pricesByWidth[w] ?? 0)]);
        ozOptAoa.push([]);
        appendSheetWithAutoCols(wb, '6_OZTECH_Options', ozOptAoa);

        // 7. LOUVRE Models & Options
        const louvreAoa = [];
        ['grand_louvre', 'louvre_flex'].forEach(k => {
          const p = DB.products[k];
          if (!p) return;
          if (p.prices) {
            pushExcelMatrixBlock(louvreAoa, `${k}:prices`, `${p.name} — Louvre Base System Matrix ($)`, p.projections, p.widths, p.prices);
          }
          if (p.ledPrices) {
            const lw = p.ledWidths || p.widths;
            const lp = Object.keys(p.ledPrices).map(Number).sort((a, b) => a - b);
            pushExcelMatrixBlock(louvreAoa, `${k}:ledPrices`, `${p.name} — Gutter LED Matrix ($)`, lp, lw, p.ledPrices);
          }
          if (p.motors) {
            louvreAoa.push(['##TABLE', 'WIDTH_ROWS', `PROD_MOTORS:${k}`, `${p.name} — Motor Surcharges by Width ($)`]);
            louvreAoa.push(['Key (Do Not Edit)', 'Motor Option', ...p.widths]);
            Object.entries(p.motors).forEach(([mKey, mObj]) => {
              louvreAoa.push([mKey, mObj.name, ...p.widths.map((_, idx) => mObj.prices[idx] ?? 0)]);
            });
            louvreAoa.push([]);
          }
        });
        appendSheetWithAutoCols(wb, '7_LOUVRE', louvreAoa);

        // 8. Fabrics (Editable / Addable / Deletable rows)
        const fabAoa = [];
        fabAoa.push(['##TABLE', 'FABRICS', 'fabrics', 'FAA & DROP A Fabrics — Edit / Add / Delete Rows (Shade Mesh & Clear PVC apply to FAA + DROP A)']);
        fabAoa.push(['Fabric Key (Leave Blank for New)', 'Category (Shade Mesh / Clear PVC / Acrylic / Canvas)', 'Fabric Name', 'Rate ($/sqm)']);
        Object.entries(DB.fabrics).forEach(([fKey, fObj]) => {
          fabAoa.push([fKey, fObj.category, fObj.name, fObj.rate]);
        });
        fabAoa.push([]);

        fabAoa.push(['##TABLE', 'FABRICS_OZTECH', 'oztechFabrics', 'OZTECH Roof Fabrics — Edit / Add / Delete Rows']);
        fabAoa.push(['Fabric Key (Leave Blank for New)', 'Category (Translucent / Blockout)', 'Fabric Name', 'Fabric Width (mm)', 'Rate ($/sqm)']);
        Object.entries(DB.oztechFabrics).forEach(([fKey, fObj]) => {
          fabAoa.push([fKey, fObj.category, fObj.name, fObj.fabricWidth, fObj.rate]);
        });
        fabAoa.push([]);
        appendSheetWithAutoCols(wb, '8_Fabrics', fabAoa);

        // 9. Sensors, Remotes & Brackets
        const hwAoa = [];
        hwAoa.push(['##TABLE', 'SENSORS', 'sensorAndRemotes', 'Sensors & Remotes by Motor Brand ($)']);
        hwAoa.push(['Motor Brand (Do Not Edit)', 'Item ID (Do Not Edit)', 'Sensor / Remote Name', 'Price ($)']);
        Object.entries(DB.sensorAndRemotes).forEach(([brand, list]) => {
          list.forEach(item => {
            hwAoa.push([brand, item.id, item.name, item.price]);
          });
        });
        hwAoa.push([]);

        hwAoa.push(['##TABLE', 'BRACKETS', 'bracketsAndExtras', 'FAA & OZTECH Additional Brackets & Hardware Extras ($)']);
        hwAoa.push(['Item ID (Do Not Edit)', 'Applicable Lineups', 'Bracket / Extra Name', 'Unit Price ($)']);
        DB.bracketsAndExtras.forEach(item => {
          const usedIn = OZTECH_BRACKET_IDS.includes(item.id) ? 'FAA + OZTECH' : 'FAA Only';
          hwAoa.push([item.id, usedIn, item.name, item.price]);
        });
        hwAoa.push([]);

        hwAoa.push(['##TABLE', 'GENIUS_BRACKETS', 'geniusBrackets', 'DROP A (GENIUS) Brackets ($)']);
        hwAoa.push(['Item ID (Do Not Edit)', 'Bracket Name', 'Unit', 'Unit Price ($)']);
        DB.geniusBrackets.forEach(item => {
          hwAoa.push([item.id, item.name, item.unit || 'Set', item.price]);
        });
        hwAoa.push([]);
        appendSheetWithAutoCols(wb, '9_Sensors_Brackets', hwAoa);

        const dateTag = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `System_Price_Tables_${dateTag}.xlsx`);
      } catch (err) {
        console.error('Excel export failed:', err);
        alert(`⚠️ Failed to export Excel file: ${err.message}`);
      }
    }

    function resolveExcelMatrixTarget(targetId) {
      if (targetId === 'OZTECH_FULL_PC') return DB.oztechFullPowderCoat.prices;
      if (targetId === 'OZTECH_UNILED') return DB.oztechLedLighting.uniled.prices;
      if (targetId === 'OZTECH_MAXI_LED') return DB.oztechLedLighting.maxi_led.prices;
      const [modelKey, prop] = String(targetId || '').split(':');
      const prod = DB.products[modelKey];
      if (!prod || !prop) return null;
      if (prop.startsWith('oz_')) {
        const modKey = prop.slice(3);
        if (!prod.modulePrices) prod.modulePrices = {};
        if (!prod.modulePrices[modKey]) prod.modulePrices[modKey] = {};
        return prod.modulePrices[modKey];
      }
      if (!prod[prop]) prod[prop] = {};
      return prod[prop];
    }

    function applyExcelWorkbookToDb(wb) {
      let tablesUpdated = 0;
      let valuesUpdated = 0;

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return;
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        let i = 0;
        while (i < aoa.length) {
          const row = aoa[i];
          if (!Array.isArray(row) || String(row[0] || '').trim() !== '##TABLE') {
            i++;
            continue;
          }

          const blockType = String(row[1] || '').trim();
          const targetId = String(row[2] || '').trim();
          const headerRow = aoa[i + 1] || [];
          let rIdx = i + 2;
          const dataRows = [];
          while (rIdx < aoa.length) {
            const dRow = aoa[rIdx];
            if (!Array.isArray(dRow) || String(dRow[0] || '').trim() === '##TABLE') break;
            const nonEmpty = dRow.some(cell => cell !== '' && cell !== null && cell !== undefined);
            if (!nonEmpty) {
              rIdx++;
              break;
            }
            dataRows.push(dRow);
            rIdx++;
          }

          if (blockType === 'MATRIX') {
            const mat = resolveExcelMatrixTarget(targetId);
            if (mat && dataRows.length > 0) {
              const colWidths = headerRow.map(v => Number(v));
              dataRows.forEach(dRow => {
                const proj = Number(dRow[0]);
                if (isNaN(proj) || proj <= 0) return;
                if (!mat[proj]) mat[proj] = {};
                for (let c = 1; c < colWidths.length; c++) {
                  const w = colWidths[c];
                  if (isNaN(w) || w <= 0) continue;
                  const rawNum = parseFloat(dRow[c]);
                  mat[proj][w] = isNaN(rawNum) ? 0 : rawNum;
                  valuesUpdated++;
                }
              });
              tablesUpdated++;
            }
          } else if (blockType === 'WIDTH_ROWS') {
            const colWidths = headerRow.slice(2).map(v => Number(v));
            dataRows.forEach(dRow => {
              const rKey = String(dRow[0] || '').trim();
              const rLabel = String(dRow[1] || '').trim();
              if (!rKey) return;
              const vals = colWidths.map((_, idx) => {
                const v = parseFloat(dRow[idx + 2]);
                return isNaN(v) ? 0 : v;
              });

              if (targetId === 'OZTECH_GUTTER_LED') {
                colWidths.forEach((w, idx) => {
                  if (!isNaN(w) && w > 0) {
                    DB.oztechLedLighting.gutter_led.pricesByWidth[w] = vals[idx];
                    valuesUpdated++;
                  }
                });
              } else if (targetId === 'FAA_MOTORS') {
                if (DB.motors[rKey]) {
                  vals.forEach((v, idx) => {
                    if (idx < DB.motors[rKey].prices.length) {
                      DB.motors[rKey].prices[idx] = v;
                      valuesUpdated++;
                    }
                  });
                }
              } else if (targetId === 'FAA_LED') {
                const [lKey, mKey] = rKey.split(':');
                const targetArr = DB.ledLighting[lKey]?.rows?.[mKey]?.prices;
                if (Array.isArray(targetArr)) {
                  vals.forEach((v, idx) => {
                    if (idx < targetArr.length) {
                      targetArr[idx] = v;
                      valuesUpdated++;
                    }
                  });
                }
              } else if (targetId.startsWith('FAA_PC:')) {
                const mKey = targetId.slice(7);
                const targetArr = DB.products[mKey]?.powderCoat?.[rKey]?.prices;
                if (Array.isArray(targetArr)) {
                  vals.forEach((v, idx) => {
                    if (idx < targetArr.length) {
                      targetArr[idx] = v;
                      valuesUpdated++;
                    }
                  });
                }
              } else if (targetId.startsWith('FAA_TRAY:')) {
                const mKey = targetId.slice(9);
                const targetArr = DB.products[mKey]?.fabricTray;
                if (Array.isArray(targetArr)) {
                  vals.forEach((v, idx) => {
                    if (idx < targetArr.length) {
                      targetArr[idx] = v;
                      valuesUpdated++;
                    }
                  });
                }
              } else if (targetId.startsWith('PROD_MOTORS:')) {
                const mKey = targetId.slice(12);
                const mObj = DB.products[mKey]?.motors?.[rKey];
                if (mObj && Array.isArray(mObj.prices)) {
                  if (rLabel) mObj.name = rLabel;
                  vals.forEach((v, idx) => {
                    if (idx < mObj.prices.length) {
                      mObj.prices[idx] = v;
                      valuesUpdated++;
                    }
                  });
                }
              }
            });
            tablesUpdated++;
          } else if (blockType === 'KEY_VAL') {
            dataRows.forEach(dRow => {
              const k = String(dRow[0] || '').trim();
              const labelStr = String(dRow[1] || '').trim();
              const numVal = parseFloat(dRow[2]);
              if (!k || isNaN(numVal)) return;

              if (targetId === 'OZTECH_SCALARS') {
                if (k === 'duratecRate') DB.oztechFullPowderCoat.duratecRate = numVal;
                else if (k === 'uniledDimmer') DB.oztechLedLighting.uniled.dimmerPrice = numVal;
                else if (k === 'maxiLedDimmer') DB.oztechLedLighting.maxi_led.dimmerPrice = numVal;
                valuesUpdated++;
              } else if (targetId.startsWith('DROPA_PC_MULT:')) {
                const mKey = targetId.slice(14);
                const optObj = DB.products[mKey]?.powderCoat?.options?.[k];
                if (optObj) {
                  if (labelStr) optObj.label = labelStr;
                  optObj.rate = numVal;
                  valuesUpdated++;
                }
              } else if (targetId.startsWith('OZTECH_RAFTER:')) {
                const mKey = targetId.slice(14);
                const projNum = Number(k);
                if (DB.products[mKey]?.additionalRafter && !isNaN(projNum)) {
                  DB.products[mKey].additionalRafter[projNum] = numVal;
                  valuesUpdated++;
                }
              }
            });
            tablesUpdated++;
          } else if (blockType === 'FABRICS') {
            const validCats = ['Shade Mesh', 'Clear PVC', 'Acrylic', 'Canvas'];
            const nextFabrics = {};
            dataRows.forEach(dRow => {
              const rawKey = String(dRow[0] || '').trim();
              const rawCat = String(dRow[1] || '').trim();
              const rawName = String(dRow[2] || '').trim();
              const rateNum = parseFloat(dRow[3]);
              if (!rawName) return;
              const matchedCat = validCats.find(c => c.toLowerCase() === rawCat.toLowerCase()) || 'Shade Mesh';
              const slug = (rawKey || rawName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom';
              let finalKey = slug;
              if (nextFabrics[finalKey]) {
                finalKey = `${slug}_${Object.keys(nextFabrics).length + 1}`;
              }
              nextFabrics[finalKey] = {
                category: matchedCat,
                name: rawName,
                rate: isNaN(rateNum) ? 0 : rateNum
              };
              valuesUpdated++;
            });
            const hasDropACompat = Object.values(nextFabrics).some(f => f.category === 'Shade Mesh' || f.category === 'Clear PVC');
            if (Object.keys(nextFabrics).length > 0 && hasDropACompat) {
              DB.fabrics = nextFabrics;
              DB.fabricsSchemaVersion = 2;
              tablesUpdated++;
            }
          } else if (blockType === 'FABRICS_OZTECH') {
            const validCats = ['Translucent', 'Blockout'];
            const nextOzFabrics = {};
            dataRows.forEach(dRow => {
              const rawKey = String(dRow[0] || '').trim();
              const rawCat = String(dRow[1] || '').trim();
              const rawName = String(dRow[2] || '').trim();
              const widthNum = parseInt(dRow[3], 10);
              const rateNum = parseFloat(dRow[4]);
              if (!rawName) return;
              const matchedCat = validCats.find(c => c.toLowerCase() === rawCat.toLowerCase()) || 'Translucent';
              const baseSlug = (rawKey || `oz_${rawName}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'oz_custom';
              let finalKey = baseSlug.startsWith('oz_') ? baseSlug : `oz_${baseSlug}`;
              if (nextOzFabrics[finalKey]) {
                finalKey = `${finalKey}_${Object.keys(nextOzFabrics).length + 1}`;
              }
              nextOzFabrics[finalKey] = {
                category: matchedCat,
                name: rawName,
                fabricWidth: (!isNaN(widthNum) && widthNum > 0) ? widthNum : 3000,
                rate: isNaN(rateNum) ? 0 : rateNum
              };
              valuesUpdated++;
            });
            if (Object.keys(nextOzFabrics).length > 0) {
              DB.oztechFabrics = nextOzFabrics;
              DB.fabricsSchemaVersion = 2;
              tablesUpdated++;
            }
          } else if (blockType === 'SENSORS') {
            dataRows.forEach(dRow => {
              const brand = String(dRow[0] || '').trim().toLowerCase();
              const itemId = String(dRow[1] || '').trim();
              const itemName = String(dRow[2] || '').trim();
              const priceNum = parseFloat(dRow[3]);
              const list = DB.sensorAndRemotes[brand];
              if (!Array.isArray(list) || !itemId) return;
              const found = list.find(it => it.id === itemId);
              if (found) {
                if (itemName) found.name = itemName;
                if (!isNaN(priceNum)) found.price = priceNum;
                valuesUpdated++;
              }
            });
            tablesUpdated++;
          } else if (blockType === 'BRACKETS') {
            dataRows.forEach(dRow => {
              const itemId = String(dRow[0] || '').trim();
              const itemName = String(dRow[2] || '').trim();
              const priceNum = parseFloat(dRow[3]);
              const found = DB.bracketsAndExtras.find(it => it.id === itemId);
              if (found) {
                if (itemName) found.name = itemName;
                if (!isNaN(priceNum)) found.price = priceNum;
                valuesUpdated++;
              }
            });
            tablesUpdated++;
          } else if (blockType === 'GENIUS_BRACKETS') {
            dataRows.forEach(dRow => {
              const itemId = String(dRow[0] || '').trim();
              const itemName = String(dRow[1] || '').trim();
              const unitStr = String(dRow[2] || '').trim();
              const priceNum = parseFloat(dRow[3]);
              const found = DB.geniusBrackets.find(it => it.id === itemId);
              if (found) {
                if (itemName) found.name = itemName;
                if (unitStr) found.unit = unitStr;
                if (!isNaN(priceNum)) found.price = priceNum;
                valuesUpdated++;
              }
            });
            tablesUpdated++;
          }

          i = rIdx;
        }
      });

      return { tablesUpdated, valuesUpdated };
    }

    document.getElementById('exportExcelBtn')?.addEventListener('click', exportPriceDbToExcel);

    document.getElementById('importExcelInput')?.addEventListener('change', async function(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await ensureXlsxLibrary();
        const arrayBuf = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuf, { type: 'array' });
        const { tablesUpdated, valuesUpdated } = applyExcelWorkbookToDb(wb);
        if (tablesUpdated === 0) {
          alert('⚠️ No valid price tables were found in this Excel file.\nPlease export the template first via [📊 Export Excel (.xlsx)], edit the values, and upload it back.');
          this.value = '';
          return;
        }
        syncSharedOztechRefs();
        saveCustomDbToStorage();
        renderSettingsEditor();
        refreshCalculatorFromDb();
        alert(`✅ Excel price database imported successfully!\n• Updated Tables: ${tablesUpdated}\n• Updated Cells / Items: ${valuesUpdated.toLocaleString()}\n\n(Tip: If using Supabase Cloud DB, open [☁️ Supabase DB Setup] and click [☁️ Push Price Tables to Cloud] to share with all dealers.)`);
      } catch (err) {
        console.error('Excel import failed:', err);
        alert(`⚠️ Failed to read Excel file: ${err.message}`);
      }
      this.value = '';
    });

    // Export JSON Button
    document.getElementById('exportJsonBtn').addEventListener('click', function() {
      const dataStr = JSON.stringify(DB, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'price_db.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Import JSON Input
    document.getElementById('importJsonInput').addEventListener('change', function(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const imported = JSON.parse(evt.target.result);
          deepMergeDb(DB, imported);
          saveCustomDbToStorage();
          renderSettingsEditor();
          refreshCalculatorFromDb();
          alert('✅ JSON price database imported and applied successfully.');
        } catch (err) {
          alert('⚠️ Invalid JSON file.');
        }
      };
      reader.readAsText(file);
      this.value = '';
    });

    // Reset to Factory Default Button
    document.getElementById('resetDefaultDbBtn').addEventListener('click', function() {
      if (!confirm('Reset all price tables and option rates back to factory defaults?')) return;
      localStorage.removeItem(CUSTOM_DB_STORAGE_KEY);
      deepMergeDb(DB, JSON.parse(JSON.stringify(DEFAULT_DB_SNAPSHOT)));
      syncSharedOztechRefs();
      const statusEl = document.getElementById('settingsStatusPill');
      if (statusEl) statusEl.textContent = '✓ Factory Default Data Restored';
      renderSettingsEditor();
      refreshCalculatorFromDb();
      alert('✅ All price tables have been restored to factory defaults.');
    });

    // =========================================================================
    // SAVED QUOTES & SUPABASE CLOUD DB INTEGRATION MODULE
    // =========================================================================
    const QUOTES_STORAGE_KEY = 'system_price_calc_saved_quotes_v1';
    const SUPABASE_CONFIG_KEY = 'system_price_calc_supabase_cfg_v1';
    const LAST_AUTHOR_KEY = 'system_price_calc_last_author_v1';

    // Default Supabase credentials (pre-filled with Project URL & Publishable Key)
    const DEFAULT_SUPABASE_CONFIG = {
      url: 'https://qzenlwoqbumyfrjdqqra.supabase.co',
      anonKey: 'sb_publishable_nkzv-jlVfDOgGKnIPGytPQ_RexxXkp2'
    };

    let savedQuotes = [];
    let currentEditingQuoteId = null;
    let currentDetailModalQuoteId = null;
    let currentJobItems = [];
    let currentEditingJobItemIndex = null;

    function normalizeSupabaseUrl(rawUrl) {
      return String(rawUrl || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/rest\/v1$/i, '');
    }

    function getSupabaseConfig() {
      try {
        const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.url || parsed.anonKey)) {
            return {
              url: normalizeSupabaseUrl(parsed.url || DEFAULT_SUPABASE_CONFIG.url),
              anonKey: (parsed.anonKey || DEFAULT_SUPABASE_CONFIG.anonKey || '').trim()
            };
          }
        }
      } catch (e) {}
      return {
        url: normalizeSupabaseUrl(DEFAULT_SUPABASE_CONFIG.url),
        anonKey: (DEFAULT_SUPABASE_CONFIG.anonKey || '').trim()
      };
    }

    function isSupabaseConfigured() {
      const cfg = getSupabaseConfig();
      return Boolean(cfg.url && cfg.anonKey);
    }

    function updateCloudStatusUI(customLabel = null, isConnectedOverride = null) {
      const pill = document.getElementById('cloudDbStatusPill');
      if (!pill) return;
      const connected = isConnectedOverride !== null ? isConnectedOverride : isSupabaseConfigured();
      pill.classList.toggle('connected', connected);
      if (customLabel) {
        pill.textContent = customLabel;
      } else {
        pill.textContent = connected
          ? '🟢 Supabase Cloud Connected'
          : '⚪ Local Mode (Browser Storage)';
      }
    }

    function loadQuotesFromLocal() {
      try {
        const raw = localStorage.getItem(QUOTES_STORAGE_KEY);
        savedQuotes = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(savedQuotes)) savedQuotes = [];
      } catch (e) {
        savedQuotes = [];
      }
      updateQuoteCountBadge();
    }

    function saveQuotesToLocal() {
      try {
        localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(savedQuotes));
      } catch (e) {
        console.error('Failed to save quotes locally:', e);
      }
      updateQuoteCountBadge();
    }

    function getVisibleQuotesForSession() {
      if (activeAccessRole === 'admin') {
        return savedQuotes;
      }
      if (activeAccessRole === 'dealer' && activeDealerInfo && activeDealerInfo.code) {
        const targetCode = String(activeDealerInfo.code).trim().toLowerCase();
        return savedQuotes.filter(
          q => String(q.form_state?.dealerCode || '').trim().toLowerCase() === targetCode
        );
      }
      return [];
    }

    function updateQuoteCountBadge() {
      const badge = document.getElementById('navQuoteCountBadge');
      if (!badge) return;
      if (!isSettingsUnlocked || !activeAccessRole) {
        badge.textContent = '🔒';
      } else {
        badge.textContent = getVisibleQuotesForSession().length;
      }
    }

    function updateQuotesRoleUI() {
      const roleBadge = document.getElementById('activeAccessRoleBadge');
      const sbBtn = document.getElementById('openSupabaseConfigModalBtn');
      const dealerFilterGrp = document.getElementById('quoteDealerFilterGroup');
      const dealerFilterSel = document.getElementById('quoteDealerFilter');
      const filterBar = document.getElementById('quotesFilterBar');

      if (activeAccessRole === 'admin') {
        if (roleBadge) {
          roleBadge.textContent = '👑 Master Admin (All Dealers View)';
          roleBadge.style.background = '#eff6ff';
          roleBadge.style.color = '#1d4ed8';
          roleBadge.style.borderColor = '#93c5fd';
        }
        if (sbBtn) sbBtn.style.display = 'inline-flex';
        if (dealerFilterGrp) dealerFilterGrp.style.display = 'block';
        if (filterBar) filterBar.style.gridTemplateColumns = '1.8fr 1fr 1fr 1fr';

        if (dealerFilterSel) {
          const prev = dealerFilterSel.value || 'ALL';
          const dealerMap = new Map();
          dealerMap.set('ADMIN', '👑 HQ Master Admin');
          dealerAccounts.forEach(d => {
            if (d.code) dealerMap.set(d.code.toUpperCase(), `🏢 ${d.name} (${d.code})`);
          });
          savedQuotes.forEach(q => {
            const dc = q.form_state?.dealerCode;
            const dn = q.form_state?.dealerName;
            if (dc && !dealerMap.has(String(dc).toUpperCase())) {
              dealerMap.set(String(dc).toUpperCase(), `🏢 ${dn || dc} (${dc})`);
            }
          });

          dealerFilterSel.innerHTML = `<option value="ALL">All Dealers & HQ (${savedQuotes.length})</option>`;
          dealerMap.forEach((label, codeKey) => {
            const opt = document.createElement('option');
            opt.value = codeKey;
            opt.textContent = label;
            dealerFilterSel.appendChild(opt);
          });
          if (Array.from(dealerFilterSel.options).some(o => o.value === prev)) {
            dealerFilterSel.value = prev;
          }
        }
      } else if (activeAccessRole === 'dealer' && activeDealerInfo) {
        if (roleBadge) {
          roleBadge.textContent = `🏢 Dealer: ${activeDealerInfo.name}`;
          roleBadge.style.background = '#ecfdf5';
          roleBadge.style.color = '#047857';
          roleBadge.style.borderColor = '#6ee7b7';
        }
        if (sbBtn) sbBtn.style.display = 'none';
        if (dealerFilterGrp) dealerFilterGrp.style.display = 'none';
        if (filterBar) filterBar.style.gridTemplateColumns = '2fr 1fr 1fr';
      }
    }

    function generateQuoteNo() {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const prefix = `QT-${yyyy}${mm}${dd}-`;
      const todayQuotes = savedQuotes.filter(q => (q.quote_no || '').startsWith(prefix));
      const nextNum = String(todayQuotes.length + 1).padStart(3, '0');
      return `${prefix}${nextNum}`;
    }

    function parsePriceTextToNumber(txt) {
      if (!txt) return 0;
      const cleaned = String(txt).replace(/[^0-9.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }

    function captureVisibleBreakdownItems() {
      const items = [];
      document.querySelectorAll('#breakdownBox .breakdown-row').forEach(row => {
        if (row.style.display === 'none') return;
        const spans = row.querySelectorAll('span');
        if (spans.length >= 2) {
          items.push({
            label: spans[0].textContent.trim(),
            priceText: spans[1].textContent.trim()
          });
        }
      });
      return items;
    }

    function captureCalculatorFormState() {
      const sensors = [];
      document.querySelectorAll('.sensor-checkbox:checked').forEach(cb => sensors.push(cb.value));

      const brackets = [];
      document.querySelectorAll('.bracket-checkbox:checked').forEach(cb => {
        const qtyInput = document.getElementById(`qty-${cb.value}`);
        brackets.push({
          id: cb.value,
          qty: parseInt(qtyInput?.value, 10) || 1
        });
      });

      return {
        activeCategory,
        productSelect: document.getElementById('productSelect')?.value || 'titan_open',
        supplyTypeSelect: document.getElementById('supplyTypeSelect')?.value || 'complete',
        dropAGroupSelect: document.getElementById('dropAGroupSelect')?.value || 'GENIUS',
        dropASubSelect: document.getElementById('dropASubSelect')?.value || 'genius_zip',
        louvreProductSelect: document.getElementById('louvreProductSelect')?.value || 'grand_louvre',
        oztechGroupSelect: document.getElementById('oztechGroupSelect')?.value || 'IZI',
        oztechSubSelect: document.getElementById('oztechSubSelect')?.value || 'oztech_izi_standard',
        oztechModuleSelect: document.getElementById('oztechModuleSelect')?.value || 'single',
        oztechOverhangCheck: Boolean(document.getElementById('oztechOverhangCheck')?.checked),
        oztechFrontHeightInput: document.getElementById('oztechFrontHeightInput')?.value || '2250',
        oztechBackHeightInput: document.getElementById('oztechBackHeightInput')?.value || '2750',
        oztechNoPostCheck: Boolean(document.getElementById('oztechNoPostCheck')?.checked),
        oztechNoPostQty: document.getElementById('oztechNoPostQty')?.value || '2',
        oztechGutterCoverCheck: Boolean(document.getElementById('oztechGutterCoverCheck')?.checked),
        louvreNoPostCheck: Boolean(document.getElementById('louvreNoPostCheck')?.checked),
        louvreNoPostQty: document.getElementById('louvreNoPostQty')?.value || '4',
        widthInput: document.getElementById('widthInput')?.value || '3800',
        projSelect: document.getElementById('projSelect')?.value || '2600',
        projInput: document.getElementById('projInput')?.value || '2000',
        fabricSelect: document.getElementById('fabricSelect')?.value || '',
        operationSelect: document.getElementById('operationSelect')?.value || 'manual',
        motorSelect: document.getElementById('motorSelect')?.value || 'ace',
        powderCoatSelect: document.getElementById('powderCoatSelect')?.value || '',
        oztechPcTypeSelect: document.getElementById('oztechPcTypeSelect')?.value || 'frame',
        ledSelect: document.getElementById('ledSelect')?.value || 'none',
        oztechGutterLedCheck: Boolean(document.getElementById('oztechGutterLedCheck')?.checked),
        louvreDimmerSelect: document.getElementById('louvreDimmerSelect')?.value || 'no',
        fabricTraySelect: document.getElementById('fabricTraySelect')?.value || 'no',
        discountInput: document.getElementById('discountInput')?.value || '0',
        onsiteAssemblyCheck: Boolean(document.getElementById('onsiteAssemblyCheck')?.checked),
        sensors,
        brackets
      };
    }

    function getEnteredProjection() {
      return activeCategory === 'FAA'
        ? (parseFloat(document.getElementById('projSelect')?.value) || 0)
        : (parseFloat(document.getElementById('projInput')?.value) || 0);
    }

    function getCurrentCalculationSnapshot() {
      calculatePrice(false);
      const resultBox = document.getElementById('resultBox');
      const priceText = document.getElementById('resultPrice')?.textContent || '-';
      const isValid = resultBox && resultBox.classList.contains('active') && priceText.startsWith('$');
      const totalPrice = isValid ? parsePriceTextToNumber(priceText) : 0;
      const product = getCurrentProduct();
      const rawWidth = parseFloat(document.getElementById('widthInput')?.value) || 0;
      const rawProj = getEnteredProjection();

      return {
        isValid,
        totalPrice,
        priceText,
        category: activeCategory,
        productKey: getCurrentProductKey(),
        productTitle: document.getElementById('resultProductTag')?.textContent || (product ? product.name : activeCategory),
        widthMm: rawWidth,
        projMm: rawProj,
        summaryBadge: document.getElementById('resultBadge')?.textContent || '',
        breakdownItems: captureVisibleBreakdownItems(),
        formState: captureCalculatorFormState()
      };
    }

    function getJobGrandTotal(items = currentJobItems) {
      return (items || []).reduce((sum, it) => {
        const unit = Number(it.unitPrice) || 0;
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        return sum + unit * qty;
      }, 0);
    }

    function renderJobItemsUI() {
      const box = document.getElementById('jobItemsBox');
      const listEl = document.getElementById('jobItemsList');
      const headerTitle = document.getElementById('jobItemsHeaderTitle');
      const grandLabel = document.getElementById('jobGrandTotalLabel');
      const grandVal = document.getElementById('jobGrandTotalValue');
      const addBtn = document.getElementById('addJobItemBtn');
      const saveBtn = document.getElementById('openSaveQuoteModalBtn');

      if (addBtn) {
        addBtn.textContent = currentEditingJobItemIndex !== null
          ? `✓ Update Item #${currentEditingJobItemIndex + 1}`
          : '➕ Add Item';
      }

      if (!box || !listEl) return;

      if (currentJobItems.length === 0) {
        box.style.display = 'none';
        listEl.innerHTML = '';
        if (saveBtn) saveBtn.textContent = '💾 Save Quote';
        return;
      }

      box.style.display = 'block';
      const totalUnits = currentJobItems.reduce((acc, it) => acc + (Math.max(1, parseInt(it.qty, 10) || 1)), 0);
      const grandTotal = getJobGrandTotal(currentJobItems);

      if (headerTitle) {
        headerTitle.textContent = `🧾 Current Quote Items (${currentJobItems.length})`;
      }
      if (grandLabel) {
        grandLabel.textContent = `Grand Total (${currentJobItems.length} Line${currentJobItems.length === 1 ? '' : 's'} • ${totalUnits} Unit${totalUnits === 1 ? '' : 's'})`;
      }
      if (grandVal) {
        grandVal.textContent = `$${formatMoney(grandTotal)}`;
      }
      if (saveBtn) {
        saveBtn.textContent = `💾 Save Quote (${currentJobItems.length} Item${currentJobItems.length === 1 ? '' : 's'})`;
      }

      listEl.innerHTML = currentJobItems.map((it, idx) => {
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        const lineSub = (Number(it.unitPrice) || 0) * qty;
        const isEditing = currentEditingJobItemIndex === idx;
        return `<div class="job-item-row ${isEditing ? 'is-editing-item' : ''}" data-jidx="${idx}">
          <div class="job-item-left">
            <div class="job-item-title">
              <span>#${idx + 1}</span>
              ${it.itemLabel ? `<span class="job-item-tag">${escapeHtml(it.itemLabel)}</span>` : ''}
              <span>${escapeHtml(it.productTitle)}</span>
            </div>
            <div class="job-item-sub">
              ${Number(it.widthMm).toLocaleString()} × ${Number(it.projMm).toLocaleString()} mm • Unit $${formatMoney(Number(it.unitPrice) || 0)}
            </div>
          </div>
          <div class="job-item-right">
            <input type="number" min="1" max="99" class="job-item-qty-input" data-jaction="qty" data-jidx="${idx}" value="${qty}" title="Quantity">
            <span class="job-item-price">$${formatMoney(lineSub)}</span>
            <button type="button" class="job-item-mini-btn" data-jaction="edit" data-jidx="${idx}" title="Load into calculator to edit">${isEditing ? 'Editing' : 'Edit'}</button>
            <button type="button" class="job-item-mini-btn" data-jaction="delete" data-jidx="${idx}" style="color:#dc2626; border-color:#fecaca;" title="Remove item">✕</button>
          </div>
        </div>`;
      }).join('');
    }

    function addOrUpdateJobItem() {
      const snap = getCurrentCalculationSnapshot();
      if (!snap.isValid) {
        alert('⚠️ Please configure valid dimensions and options before adding an item to the quote.');
        return;
      }

      const labelInput = document.getElementById('jobItemLabelInput');
      const qtyInput = document.getElementById('jobItemQtyInput');
      const itemLabel = (labelInput?.value || '').trim();
      const qty = Math.max(1, parseInt(qtyInput?.value, 10) || 1);

      const itemObj = {
        id: (currentEditingJobItemIndex !== null && currentJobItems[currentEditingJobItemIndex])
          ? currentJobItems[currentEditingJobItemIndex].id
          : ('ji_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
        itemLabel,
        qty,
        unitPrice: snap.totalPrice,
        lineTotal: snap.totalPrice * qty,
        category: snap.category,
        productKey: snap.productKey,
        productTitle: snap.productTitle,
        widthMm: snap.widthMm,
        projMm: snap.projMm,
        summaryBadge: snap.summaryBadge,
        breakdownItems: snap.breakdownItems,
        formState: snap.formState
      };

      if (currentEditingJobItemIndex !== null && currentJobItems[currentEditingJobItemIndex]) {
        currentJobItems[currentEditingJobItemIndex] = itemObj;
        currentEditingJobItemIndex = null;
      } else {
        currentJobItems.push(itemObj);
      }

      if (labelInput) labelInput.value = '';
      if (qtyInput) qtyInput.value = '1';
      renderJobItemsUI();
    }

    function updateEditingBannerUI() {
      const banner = document.getElementById('editingQuoteBanner');
      const textEl = document.getElementById('editingQuoteBannerText');
      if (!banner || !textEl) return;
      if (!currentEditingQuoteId) {
        banner.style.display = 'none';
        return;
      }
      const q = savedQuotes.find(item => item.id === currentEditingQuoteId);
      if (!q) {
        currentEditingQuoteId = null;
        banner.style.display = 'none';
        return;
      }
      banner.style.display = 'flex';
      textEl.textContent = `✏️ Editing Quote: ${q.quote_no} (${q.client_name})`;
    }

    document.getElementById('clearEditingQuoteBtn')?.addEventListener('click', function() {
      currentEditingQuoteId = null;
      currentJobItems = [];
      currentEditingJobItemIndex = null;
      updateEditingBannerUI();
      renderJobItemsUI();
    });

    // Apply a single item's formState back into the calculator controls
    function applyFormStateToCalculator(st, fallbackCategory = 'FAA') {
      if (!st) return;

      // 1. Switch category
      setCategory(st.activeCategory || fallbackCategory || 'FAA');

      // 2. Restore Product Model & Sub-Type per category
      if (st.activeCategory === 'FAA') {
        setFaaModel(st.productSelect || 'titan_open', false);
        setFaaSupplyType(st.supplyTypeSelect || 'complete', true);
        if (st.projSelect) document.getElementById('projSelect').value = st.projSelect;
      } else if (st.activeCategory === 'DROP A') {
        setDropAGroup(st.dropAGroupSelect || 'GENIUS', false);
        populateDropASubModels();
        setDropASubModel(st.dropASubSelect || 'genius_zip', false);
      } else if (st.activeCategory === 'LOUVRE') {
        setLouvreModel(st.louvreProductSelect || 'grand_louvre', false);
      } else if (st.activeCategory === 'OZTECH') {
        setOztechGroup(st.oztechGroupSelect || 'IZI', false);
        populateOztechSubModels();
        if (st.oztechSubSelect) {
          setOztechSubModel(st.oztechSubSelect, false);
        }
        if (st.oztechModuleSelect) {
          document.getElementById('oztechModuleSelect').value = st.oztechModuleSelect;
        }
        const ovCheck = document.getElementById('oztechOverhangCheck');
        if (ovCheck) ovCheck.checked = Boolean(st.oztechOverhangCheck);
        if (st.oztechFrontHeightInput !== undefined) {
          document.getElementById('oztechFrontHeightInput').value = st.oztechFrontHeightInput;
        }
        if (st.oztechBackHeightInput !== undefined) {
          document.getElementById('oztechBackHeightInput').value = st.oztechBackHeightInput;
        }
        updateOztechModuleHints();
      }

      // 3. Restore Dimensions
      if (st.widthInput !== undefined) document.getElementById('widthInput').value = st.widthInput;
      if (st.projInput !== undefined) document.getElementById('projInput').value = st.projInput;

      // 4. Restore Posts & Gutter Cover
      const ozNoPostCheck = document.getElementById('oztechNoPostCheck');
      if (ozNoPostCheck) ozNoPostCheck.checked = Boolean(st.oztechNoPostCheck);
      if (st.oztechNoPostQty !== undefined) document.getElementById('oztechNoPostQty').value = st.oztechNoPostQty;
      const ozGutterCover = document.getElementById('oztechGutterCoverCheck');
      if (ozGutterCover) ozGutterCover.checked = Boolean(st.oztechGutterCoverCheck);

      const lvNoPostCheck = document.getElementById('louvreNoPostCheck');
      if (lvNoPostCheck) lvNoPostCheck.checked = Boolean(st.louvreNoPostCheck);
      if (st.louvreNoPostQty !== undefined && document.getElementById('louvreNoPostQty')) {
        document.getElementById('louvreNoPostQty').value = st.louvreNoPostQty;
      }

      // 5. Repopulate dynamic dropdowns for current model, then set values
      populateFabricOptions(false);
      if (st.fabricSelect) {
        const fabSel = document.getElementById('fabricSelect');
        if (Array.from(fabSel.options).some(o => o.value === st.fabricSelect)) {
          fabSel.value = st.fabricSelect;
        }
      }

      populateOperationOptions(false);
      if (st.operationSelect) document.getElementById('operationSelect').value = st.operationSelect;
      populateMotorOptions(false);
      if (st.motorSelect) {
        const motorSel = document.getElementById('motorSelect');
        motorSel.value = st.motorSelect;
      }
      document.getElementById('motorSelect').disabled = document.getElementById('operationSelect').value !== 'motorised';
      updateMotorButtonsUI();

      populatePowderCoatOptions();
      if (st.powderCoatSelect) document.getElementById('powderCoatSelect').value = st.powderCoatSelect;
      if (st.oztechPcTypeSelect) {
        const ozPcSel = document.getElementById('oztechPcTypeSelect');
        if (ozPcSel) ozPcSel.value = st.oztechPcTypeSelect;
      }

      populateLedOptions();
      if (st.ledSelect) document.getElementById('ledSelect').value = st.ledSelect;
      updateOztechMainLedUI();

      const ozGutterLedCheck = document.getElementById('oztechGutterLedCheck');
      if (ozGutterLedCheck) ozGutterLedCheck.checked = Boolean(st.oztechGutterLedCheck);
      updateOztechGutterLedUI();

      populateDimmerOptions();
      if (st.louvreDimmerSelect && document.getElementById('louvreDimmerSelect')) {
        document.getElementById('louvreDimmerSelect').value = st.louvreDimmerSelect;
      }

      if (st.fabricTraySelect && document.getElementById('fabricTraySelect')) {
        document.getElementById('fabricTraySelect').value = st.fabricTraySelect;
      }

      // 6. Restore Sensors & Brackets
      renderSensorOptions();
      if (Array.isArray(st.sensors)) {
        document.querySelectorAll('.sensor-checkbox').forEach(cb => {
          cb.checked = st.sensors.includes(cb.value);
          cb.closest('.checkbox-item')?.classList.toggle('checked', cb.checked);
        });
      }

      renderBracketOptions();
      if (Array.isArray(st.brackets)) {
        const bMap = new Map(st.brackets.map(b => [b.id, b.qty]));
        document.querySelectorAll('.bracket-checkbox').forEach(cb => {
          const matchedQty = bMap.get(cb.value);
          cb.checked = matchedQty !== undefined;
          cb.closest('.checkbox-item')?.classList.toggle('checked', cb.checked);
          const qInp = document.getElementById(`qty-${cb.value}`);
          if (qInp) {
            qInp.disabled = !cb.checked;
            if (matchedQty !== undefined) qInp.value = matchedQty;
          }
          const subEl = document.getElementById(`sub-${cb.value}`);
          const unitP = parseFloat(cb.dataset.price) || 0;
          if (subEl) {
            const q = matchedQty !== undefined ? (parseInt(matchedQty, 10) || 1) : 1;
            subEl.textContent = cb.checked ? `+$${(unitP * q).toLocaleString()}` : `+$${unitP.toLocaleString()}`;
          }
        });
      }

      // 7. Restore Discount & On-Site Assembly
      if (st.discountInput !== undefined) document.getElementById('discountInput').value = st.discountInput;
      const onsiteCheck = document.getElementById('onsiteAssemblyCheck');
      if (onsiteCheck) onsiteCheck.checked = Boolean(st.onsiteAssemblyCheck);
      updateOnsiteAssemblyUI();

      // 8. Recalculate
      updateInputHints();
      renderTable();
      calculatePrice(false);
    }

    // Restore a saved quote's complete state (single or multi-item) back into the calculator
    function loadQuoteIntoCalculator(quote) {
      if (!quote || !quote.form_state) return;
      const st = quote.form_state;
      currentEditingQuoteId = quote.id;
      currentEditingJobItemIndex = null;

      if (Array.isArray(st.items) && st.items.length > 0) {
        currentJobItems = JSON.parse(JSON.stringify(st.items));
        const firstItem = currentJobItems[0];
        if (firstItem && firstItem.formState) {
          applyFormStateToCalculator(firstItem.formState, firstItem.category || quote.category);
        } else {
          applyFormStateToCalculator(st, quote.category);
        }
      } else {
        currentJobItems = [];
        applyFormStateToCalculator(st, quote.category);
      }

      const labelInput = document.getElementById('jobItemLabelInput');
      const qtyInput = document.getElementById('jobItemQtyInput');
      if (labelInput) labelInput.value = '';
      if (qtyInput) qtyInput.value = '1';

      renderJobItemsUI();
      updateEditingBannerUI();
      switchPageMode('calc');
    }

    // Supabase REST API Helper Functions
    async function supabaseFetch(path, options = {}) {
      const cfg = getSupabaseConfig();
      if (!cfg.url || !cfg.anonKey) {
        throw new Error('Supabase Project URL or API Key is not configured.');
      }
      const makeHeaders = (includeBearer) => ({
        'apikey': cfg.anonKey,
        ...(includeBearer ? { 'Authorization': `Bearer ${cfg.anonKey}` } : {}),
        'Content-Type': 'application/json',
        ...(options.headers || {})
      });

      let response = await fetch(`${cfg.url}/rest/v1/${path}`, {
        ...options,
        headers: makeHeaders(true)
      });

      // Fallback without Authorization header if non-JWT publishable key was rejected by PostgREST JWT parser
      if ((response.status === 401 || response.status === 403) && !cfg.anonKey.startsWith('eyJ')) {
        response = await fetch(`${cfg.url}/rest/v1/${path}`, {
          ...options,
          headers: makeHeaders(false)
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase Error (${response.status}): ${errText}`);
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    async function syncQuotesFromSupabase(showAlertOnSuccess = false) {
      if (!isSupabaseConfigured()) {
        updateCloudStatusUI('⚪ Local Mode (Browser Storage)', false);
        return;
      }
      try {
        updateCloudStatusUI('🔄 Syncing with Supabase...', true);
        await pullDealersAndAuthFromCloud();
        const remoteQuotes = await supabaseFetch('quotes?select=*&order=updated_at.desc');
        if (Array.isArray(remoteQuotes)) {
          // Merge local unsynced quotes if any, prioritizing remote records
          const remoteMap = new Map(remoteQuotes.map(q => [q.id, q]));
          for (const localQ of savedQuotes) {
            if (!remoteMap.has(localQ.id)) {
              try {
                await upsertQuoteToSupabase(localQ);
                remoteMap.set(localQ.id, localQ);
              } catch (e) {
                console.warn('Could not push local quote during sync:', e);
              }
            }
          }
          savedQuotes = Array.from(remoteMap.values()).sort((a, b) =>
            new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
          );
          saveQuotesToLocal();
          updateQuotesRoleUI();
          renderSavedQuotesList();
        }
        updateCloudStatusUI('🟢 Supabase Cloud Connected', true);
        if (showAlertOnSuccess) {
          const visibleCount = getVisibleQuotesForSession().length;
          alert(`✅ Synced with Supabase Cloud DB (${visibleCount} quote${visibleCount === 1 ? '' : 's'} in your view).`);
        }
      } catch (err) {
        console.error('Supabase sync error:', err);
        updateCloudStatusUI('⚠️ Cloud Sync Error (Check Setup)', false);
        if (showAlertOnSuccess) {
          alert(`⚠️ Supabase sync failed:\n${err.message}\n\n(For first-time setup, please run the table creation SQL inside 'Supabase DB Setup' in your Supabase SQL Editor.)`);
        }
      }
    }

    async function upsertQuoteToSupabase(quoteObj) {
      if (!isSupabaseConfigured()) return false;
      await supabaseFetch('quotes?on_conflict=id', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(quoteObj)
      });
      return true;
    }

    async function deleteQuoteFromSupabase(quoteId) {
      if (!isSupabaseConfigured()) return false;
      await supabaseFetch(`quotes?id=eq.${encodeURIComponent(quoteId)}`, {
        method: 'DELETE'
      });
      return true;
    }

    // Build unified save payload for single-item or multi-item quotes
    function buildEffectiveSavePayload() {
      let itemsToSave = [];

      if (currentJobItems.length > 0) {
        itemsToSave = currentJobItems.map(it => {
          const qty = Math.max(1, parseInt(it.qty, 10) || 1);
          const unitPrice = Number(it.unitPrice) || 0;
          return {
            ...it,
            qty,
            unitPrice,
            lineTotal: unitPrice * qty
          };
        });
      } else {
        const snap = getCurrentCalculationSnapshot();
        if (!snap.isValid) {
          return { isValid: false };
        }
        const labelVal = (document.getElementById('jobItemLabelInput')?.value || '').trim();
        const qtyVal = Math.max(1, parseInt(document.getElementById('jobItemQtyInput')?.value, 10) || 1);
        itemsToSave = [{
          id: 'ji_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          itemLabel: labelVal,
          qty: qtyVal,
          unitPrice: snap.totalPrice,
          lineTotal: snap.totalPrice * qtyVal,
          category: snap.category,
          productKey: snap.productKey,
          productTitle: snap.productTitle,
          widthMm: snap.widthMm,
          projMm: snap.projMm,
          summaryBadge: snap.summaryBadge,
          breakdownItems: snap.breakdownItems,
          formState: snap.formState
        }];
      }

      const grandTotal = getJobGrandTotal(itemsToSave);
      const uniqueCats = Array.from(new Set(itemsToSave.map(i => i.category)));
      const first = itemsToSave[0];
      const isMulti = itemsToSave.length > 1 || first.qty > 1 || Boolean(first.itemLabel);

      let productTitle = first.productTitle;
      if (itemsToSave.length > 1) {
        productTitle = `${itemsToSave.length} Items • ${first.productTitle} + ${itemsToSave.length - 1} more`;
      } else {
        productTitle = `${first.itemLabel ? '[' + first.itemLabel + '] ' : ''}${first.productTitle}${first.qty > 1 ? ' ×' + first.qty : ''}`;
      }

      const summaryBadge = itemsToSave.length > 1
        ? itemsToSave.map((it, idx) => `#${idx + 1}${it.itemLabel ? ' [' + it.itemLabel + ']' : ''} ${it.productTitle} (${Number(it.widthMm).toLocaleString()}×${Number(it.projMm).toLocaleString()}mm) ×${it.qty}`).join(' | ')
        : first.summaryBadge;

      const breakdownItems = isMulti
        ? itemsToSave.map((it, idx) => ({
            label: `#${idx + 1}${it.itemLabel ? ' [' + it.itemLabel + ']' : ''} ${it.productTitle} (${Number(it.widthMm).toLocaleString()}×${Number(it.projMm).toLocaleString()}mm) ×${it.qty}`,
            priceText: `$${formatMoney((Number(it.unitPrice) || 0) * it.qty)}`
          }))
        : first.breakdownItems;

      return {
        isValid: true,
        isMulti,
        items: itemsToSave,
        totalPrice: grandTotal,
        priceText: `$${formatMoney(grandTotal)}`,
        category: uniqueCats.length === 1 ? uniqueCats[0] : 'MULTI',
        productKey: itemsToSave.length === 1 ? first.productKey : 'multi_item_job',
        productTitle,
        widthMm: first.widthMm,
        projMm: first.projMm,
        summaryBadge,
        breakdownItems,
        formState: {
          ...first.formState,
          isMultiItem: isMulti,
          items: itemsToSave
        }
      };
    }

    function updateSqVerifiedDealerBadge() {
      const codeInp = document.getElementById('sqDealerCodeInput');
      const badge = document.getElementById('sqVerifiedDealerBadge');
      if (!codeInp || !badge) return;
      const val = codeInp.value.trim();
      if (!val) {
        badge.textContent = 'Enter code to verify';
        badge.style.color = '#64748b';
        return;
      }
      const res = resolveAccessCode(val);
      if (res) {
        badge.textContent = res.role === 'admin' ? `✓ 👑 ${res.name}` : `✓ 🏢 ${res.name}`;
        badge.style.color = '#059669';
      } else {
        badge.textContent = '⚠️ Unrecognized code';
        badge.style.color = '#dc2626';
      }
    }

    document.getElementById('sqDealerCodeInput')?.addEventListener('input', updateSqVerifiedDealerBadge);

    // Open Save Quote Modal
    async function openSaveQuoteModal() {
      const payload = buildEffectiveSavePayload();
      if (!payload.isValid) {
        alert('⚠️ Please configure a valid product price (or add items to the quote) before saving.');
        return;
      }

      if (isSupabaseConfigured()) {
        pullDealersAndAuthFromCloud();
      }

      const previewEl = document.getElementById('saveQuoteSummaryPreview');
      if (previewEl) {
        const subDesc = payload.items.length > 1
          ? `${payload.items.length} Line Items (${payload.items.reduce((a, b) => a + b.qty, 0)} Units Total)`
          : `${payload.productTitle} (${Number(payload.widthMm).toLocaleString()} × ${Number(payload.projMm).toLocaleString()} mm)`;
        previewEl.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
          <span>${escapeHtml(subDesc)}</span>
          <span style="color:#059669; font-size:1.05rem;">${payload.priceText}</span>
        </div>`;
      }

      const existing = currentEditingQuoteId
        ? savedQuotes.find(q => q.id === currentEditingQuoteId)
        : null;

      const updateBtn = document.getElementById('updateExistingQuoteBtn');
      const saveNewBtn = document.getElementById('confirmSaveQuoteBtn');
      const dealerCodeInp = document.getElementById('sqDealerCodeInput');
      if (dealerCodeInp) {
        dealerCodeInp.value = '';
      }
      updateSqVerifiedDealerBadge();

      if (existing) {
        document.getElementById('sqQuoteNoInput').value = existing.quote_no || generateQuoteNo();
        document.getElementById('sqStatusSelect').value = existing.status || 'draft';
        document.getElementById('sqClientNameInput').value = existing.client_name || '';
        document.getElementById('sqClientPhoneInput').value = existing.client_phone || '';
        document.getElementById('sqSiteAddressInput').value = existing.site_address || '';
        document.getElementById('sqAuthorInput').value = existing.author || '';
        document.getElementById('sqMemoInput').value = existing.memo || '';
        if (updateBtn) updateBtn.style.display = 'inline-flex';
        if (saveNewBtn) saveNewBtn.textContent = '➕ Save as New Quote';
      } else {
        document.getElementById('sqQuoteNoInput').value = generateQuoteNo();
        document.getElementById('sqStatusSelect').value = 'draft';
        document.getElementById('sqClientNameInput').value = '';
        document.getElementById('sqClientPhoneInput').value = '';
        document.getElementById('sqSiteAddressInput').value = '';
        document.getElementById('sqAuthorInput').value = '';
        document.getElementById('sqMemoInput').value = '';
        if (updateBtn) updateBtn.style.display = 'none';
        if (saveNewBtn) saveNewBtn.textContent = '💾 Save Quote';
      }

      document.getElementById('saveQuoteModal')?.classList.add('open');
      setTimeout(() => document.getElementById('sqDealerCodeInput')?.focus(), 50);
    }

    function closeSaveQuoteModal() {
      document.getElementById('saveQuoteModal')?.classList.remove('open');
    }

    async function handleSaveQuoteSubmit(isUpdateExisting = false) {
      const payload = buildEffectiveSavePayload();
      if (!payload.isValid) return;

      const enteredDealerCode = (document.getElementById('sqDealerCodeInput')?.value || '').trim();
      if (!enteredDealerCode) {
        alert('Please enter your Company / Dealer Access Code.');
        document.getElementById('sqDealerCodeInput')?.focus();
        return;
      }

      let resolvedDealer = resolveAccessCode(enteredDealerCode);
      if (!resolvedDealer && isSupabaseConfigured()) {
        await pullDealersAndAuthFromCloud();
        resolvedDealer = resolveAccessCode(enteredDealerCode);
      }
      if (!resolvedDealer) {
        alert('⚠️ Invalid Company / Dealer Access Code. Please check your assigned dealer code with HQ.');
        document.getElementById('sqDealerCodeInput')?.focus();
        return;
      }

      const clientName = document.getElementById('sqClientNameInput').value.trim();
      if (!clientName) {
        alert('Please enter the Client / Customer Name.');
        document.getElementById('sqClientNameInput').focus();
        return;
      }

      const quoteNoInput = document.getElementById('sqQuoteNoInput').value.trim() || generateQuoteNo();
      const status = document.getElementById('sqStatusSelect').value || 'draft';
      const clientPhone = document.getElementById('sqClientPhoneInput').value.trim();
      const siteAddress = document.getElementById('sqSiteAddressInput').value.trim();
      const author = document.getElementById('sqAuthorInput').value.trim();
      const memo = document.getElementById('sqMemoInput').value.trim();

      const enrichedFormState = {
        ...payload.formState,
        dealerCode: resolvedDealer.code,
        dealerName: resolvedDealer.name
      };

      const nowIso = new Date().toISOString();
      let targetQuote = null;

      if (isUpdateExisting && currentEditingQuoteId) {
        const idx = savedQuotes.findIndex(q => q.id === currentEditingQuoteId);
        if (idx !== -1) {
          targetQuote = {
            ...savedQuotes[idx],
            quote_no: quoteNoInput,
            status,
            client_name: clientName,
            client_phone: clientPhone,
            site_address: siteAddress,
            author,
            memo,
            category: payload.category,
            product_key: payload.productKey,
            product_title: payload.productTitle,
            width_mm: payload.widthMm,
            proj_mm: payload.projMm,
            total_price: payload.totalPrice,
            summary_badge: payload.summaryBadge,
            breakdown_items: payload.breakdownItems,
            form_state: enrichedFormState,
            updated_at: nowIso
          };
          savedQuotes[idx] = targetQuote;
        }
      }

      if (!targetQuote) {
        const newId = 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const quoteNo = (isUpdateExisting || !currentEditingQuoteId) ? quoteNoInput : generateQuoteNo();
        targetQuote = {
          id: newId,
          quote_no: quoteNo,
          status,
          client_name: clientName,
          client_phone: clientPhone,
          site_address: siteAddress,
          author,
          memo,
          category: payload.category,
          product_key: payload.productKey,
          product_title: payload.productTitle,
          width_mm: payload.widthMm,
          proj_mm: payload.projMm,
          total_price: payload.totalPrice,
          summary_badge: payload.summaryBadge,
          breakdown_items: payload.breakdownItems,
          form_state: enrichedFormState,
          created_at: nowIso,
          updated_at: nowIso
        };
        savedQuotes.unshift(targetQuote);
      }

      // Reset all entered calculator inputs, job items, and editing state after saving
      currentEditingQuoteId = null;
      currentJobItems = [];
      currentEditingJobItemIndex = null;
      resetCalculatorConfiguration(true);
      renderJobItemsUI();
      updateEditingBannerUI();

      saveQuotesToLocal();
      closeSaveQuoteModal();

      if (isSupabaseConfigured()) {
        try {
          await upsertQuoteToSupabase(targetQuote);
          updateCloudStatusUI('🟢 Supabase Cloud Connected', true);
          alert(`✅ Quote (${targetQuote.quote_no}) saved under [${resolvedDealer.name}]. Calculator has been reset for a new quote.`);
        } catch (err) {
          console.error('Supabase save error:', err);
          alert(`⚠️ Saved locally in browser, but failed to upload to Supabase Cloud:\n${err.message}`);
        }
      } else {
        alert(`✅ Quote (${targetQuote.quote_no}) saved under [${resolvedDealer.name}]. Calculator has been reset for a new quote.`);
      }
    }

    // Build Plain-Text Quote Summary for Clipboard Copy
    function buildQuotePlainText(quoteObj = null) {
      if (quoteObj) {
        const lines = [
          `[QUOTE SUMMARY — ${quoteObj.quote_no}]`,
          `• Client: ${quoteObj.client_name}${quoteObj.client_phone ? ' (' + quoteObj.client_phone + ')' : ''}`,
          ...(quoteObj.site_address ? [`• Site: ${quoteObj.site_address}`] : []),
          `----------------------------------------`
        ];
        const multiItems = quoteObj.form_state?.items;
        if (Array.isArray(multiItems) && multiItems.length > 0) {
          multiItems.forEach((it, idx) => {
            const qty = Math.max(1, parseInt(it.qty, 10) || 1);
            const sub = (Number(it.unitPrice) || 0) * qty;
            lines.push(`#${idx + 1}${it.itemLabel ? ' [' + it.itemLabel + ']' : ''} ${it.productTitle}`);
            lines.push(`   Size: ${Number(it.widthMm).toLocaleString()} × ${Number(it.projMm).toLocaleString()} mm | Qty: ${qty} | Unit: $${formatMoney(Number(it.unitPrice) || 0)} | Subtotal: $${formatMoney(sub)}`);
            (it.breakdownItems || []).forEach(b => {
              lines.push(`   - ${b.label}: ${b.priceText}`);
            });
          });
        } else {
          lines.push(`• Product: ${quoteObj.product_title}`);
          lines.push(`• Size: ${Number(quoteObj.width_mm).toLocaleString()} × ${Number(quoteObj.proj_mm).toLocaleString()} mm`);
          (quoteObj.breakdown_items || []).forEach(item => {
            lines.push(`- ${item.label}: ${item.priceText}`);
          });
        }
        lines.push(`----------------------------------------`);
        lines.push(`GRAND TOTAL ESTIMATED PRICE: $${formatMoney(Number(quoteObj.total_price) || 0)}`);
        if (quoteObj.memo) lines.push(`• Notes: ${quoteObj.memo}`);
        return lines.join('\n');
      }

      const payload = buildEffectiveSavePayload();
      if (!payload.isValid) return '';
      const lines = [`[SYSTEM PRICE ESTIMATE]`, `----------------------------------------`];
      payload.items.forEach((it, idx) => {
        const qty = Math.max(1, parseInt(it.qty, 10) || 1);
        const sub = (Number(it.unitPrice) || 0) * qty;
        lines.push(`#${idx + 1}${it.itemLabel ? ' [' + it.itemLabel + ']' : ''} ${it.productTitle}`);
        lines.push(`   Size: ${Number(it.widthMm).toLocaleString()} × ${Number(it.projMm).toLocaleString()} mm | Qty: ${qty} | Unit: $${formatMoney(Number(it.unitPrice) || 0)} | Subtotal: $${formatMoney(sub)}`);
        (it.breakdownItems || []).forEach(b => {
          lines.push(`   - ${b.label}: ${b.priceText}`);
        });
      });
      lines.push(`----------------------------------------`);
      lines.push(`GRAND TOTAL ESTIMATED PRICE: ${payload.priceText}`);
      return lines.join('\n');
    }

    // Render Saved Quotes List & KPIs
    function renderSavedQuotesList() {
      const container = document.getElementById('quotesListContainer');
      if (!container) return;

      updateQuotesRoleUI();
      const visibleQuotes = getVisibleQuotesForSession();

      const searchVal = (document.getElementById('quoteSearchInput')?.value || '').trim().toLowerCase();
      const catFilter = document.getElementById('quoteCategoryFilter')?.value || 'ALL';
      const statusFilter = document.getElementById('quoteStatusFilter')?.value || 'ALL';
      const dealerFilter = document.getElementById('quoteDealerFilter')?.value || 'ALL';

      // Update KPIs across visible quotes for current role/dealer
      const totalCount = visibleQuotes.length;
      const activeCount = visibleQuotes.filter(q => q.status === 'draft' || q.status === 'sent').length;
      const approvedCount = visibleQuotes.filter(q => q.status === 'approved').length;
      const totalVol = visibleQuotes.reduce((acc, q) => acc + (Number(q.total_price) || 0), 0);

      const elTotal = document.getElementById('kpiTotalQuotes');
      const elActive = document.getElementById('kpiActiveQuotes');
      const elApproved = document.getElementById('kpiApprovedQuotes');
      const elAmount = document.getElementById('kpiTotalAmount');
      if (elTotal) elTotal.textContent = totalCount;
      if (elActive) elActive.textContent = activeCount;
      if (elApproved) elApproved.textContent = approvedCount;
      if (elAmount) elAmount.textContent = `$${formatMoney(totalVol)}`;

      const filtered = visibleQuotes.filter(q => {
        if (activeAccessRole === 'admin' && dealerFilter !== 'ALL') {
          const qCode = String(q.form_state?.dealerCode || 'ADMIN').toUpperCase();
          if (qCode !== dealerFilter) return false;
        }
        if (catFilter !== 'ALL' && q.category !== catFilter) {
          const itemCats = Array.isArray(q.form_state?.items) ? q.form_state.items.map(i => i.category) : [];
          if (!itemCats.includes(catFilter)) return false;
        }
        if (statusFilter !== 'ALL' && q.status !== statusFilter) return false;
        if (searchVal) {
          const itemHay = Array.isArray(q.form_state?.items)
            ? q.form_state.items.map(i => `${i.itemLabel || ''} ${i.productTitle || ''}`).join(' ')
            : '';
          const hay = [
            q.quote_no,
            q.client_name,
            q.client_phone,
            q.site_address,
            q.author,
            q.memo,
            q.product_title,
            q.summary_badge,
            q.form_state?.dealerName || '',
            q.form_state?.dealerCode || '',
            itemHay
          ].join(' ').toLowerCase();
          if (!hay.includes(searchVal)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted); background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px;">
          <div style="font-size: 1.6rem; margin-bottom: 0.4rem;">📭</div>
          <div style="font-weight: 700; color: #334155;">No saved quotes found for your account or filter criteria.</div>
          <div style="font-size: 0.78rem; margin-top: 0.25rem;">Click <strong>[💾 Save Quote]</strong> in the Calculator summary card to save a single or multi-item quote.</div>
        </div>`;
        return;
      }

      container.innerHTML = filtered.map(q => {
        const dateStr = q.updated_at
          ? new Date(q.updated_at).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : '';
        const statusClass = `q-status-${q.status || 'draft'}`;
        const itemsArr = Array.isArray(q.form_state?.items) ? q.form_state.items : [];
        const specLineHtml = itemsArr.length > 1
          ? `<strong>🧾 ${itemsArr.length} Items (${itemsArr.reduce((s, i) => s + (parseInt(i.qty, 10) || 1), 0)} Units)</strong> — ${escapeHtml(q.summary_badge || '')}`
          : `<strong>📐 ${Number(q.width_mm).toLocaleString()} × ${Number(q.proj_mm).toLocaleString()} mm</strong>${q.summary_badge ? ` — ${escapeHtml(q.summary_badge)}` : ''}`;
        const dealerBadgeHtml = q.form_state?.dealerName
          ? `<span style="background:#e0e7ff; color:#1e40af; border:1px solid #c7d2fe; border-radius:999px; padding:0.15rem 0.5rem; font-size:0.7rem; font-weight:700;">🏢 ${escapeHtml(q.form_state.dealerName)}</span>`
          : '';

        return `<div class="quote-item-card" data-qid="${q.id}">
          <div class="quote-item-top">
            <div class="quote-item-badges">
              <span class="q-no-badge">${escapeHtml(q.quote_no || 'QT')}</span>
              ${dealerBadgeHtml}
              <span class="q-cat-badge">${escapeHtml(q.product_title || q.category)}</span>
              <select class="q-status-select ${statusClass}" data-action="status" data-qid="${q.id}">
                <option value="draft" ${q.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="sent" ${q.status === 'sent' ? 'selected' : ''}>Sent</option>
                <option value="approved" ${q.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="hold" ${q.status === 'hold' ? 'selected' : ''}>On Hold</option>
              </select>
            </div>
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">
              ${q.author ? `👤 ${escapeHtml(q.author)} • ` : ''}${dateStr}
            </span>
          </div>

          <div class="quote-item-body">
            <div class="quote-client-info">
              <div class="quote-client-name">
                <span>${escapeHtml(q.client_name || 'Unnamed Client')}</span>
                ${q.client_phone ? `<span style="font-size:0.78rem; font-weight:600; color:#475569;">📞 ${escapeHtml(q.client_phone)}</span>` : ''}
              </div>
              ${q.site_address ? `<div class="quote-client-meta">📍 ${escapeHtml(q.site_address)}</div>` : ''}
              <div class="quote-spec-summary">${specLineHtml}</div>
              ${q.memo ? `<div class="quote-memo-box">💬 ${escapeHtml(q.memo)}</div>` : ''}
            </div>

            <div class="quote-price-actions">
              <div class="quote-item-price">$${formatMoney(Number(q.total_price) || 0)}</div>
              <div class="quote-item-btns">
                <button type="button" class="settings-action-btn primary" data-action="load" data-qid="${q.id}" style="padding: 0.36rem 0.65rem; font-size: 0.74rem;">📂 Load</button>
                <button type="button" class="settings-action-btn" data-action="detail" data-qid="${q.id}" style="padding: 0.36rem 0.6rem; font-size: 0.74rem;">📄 Details / Print</button>
                <button type="button" class="settings-action-btn danger" data-action="delete" data-qid="${q.id}" style="padding: 0.36rem 0.55rem; font-size: 0.74rem;">🗑️</button>
              </div>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Open Quote Detail / Print Modal
    function openQuoteDetailModal(quoteId) {
      const q = savedQuotes.find(item => item.id === quoteId);
      if (!q) return;
      currentDetailModalQuoteId = q.id;

      document.getElementById('qdModalQuoteNo').textContent = q.quote_no || 'QT';
      const dateStr = q.updated_at ? new Date(q.updated_at).toLocaleString() : '-';
      const itemsArr = Array.isArray(q.form_state?.items) ? q.form_state.items : [];

      let bodyItemsHtml = '';
      if (itemsArr.length > 0) {
        bodyItemsHtml = itemsArr.map((it, idx) => {
          const qty = Math.max(1, parseInt(it.qty, 10) || 1);
          const unitP = Number(it.unitPrice) || 0;
          const subP = unitP * qty;
          const bRows = (it.breakdownItems || []).map(b => `
            <div style="display:flex; justify-content:space-between; padding: 0.24rem 0; border-bottom: 1px dashed #e2e8f0; font-size:0.76rem; color:#475569;">
              <span>${escapeHtml(b.label)}</span>
              <span>${escapeHtml(b.priceText)}</span>
            </div>
          `).join('');

          return `<div style="border:1px solid #cbd5e1; border-radius:9px; padding:0.65rem 0.85rem; margin-bottom:0.65rem; background:#ffffff;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.35rem;">
              <div>
                <div style="font-weight:800; color:#1d4ed8; font-size:0.86rem;">
                  Item #${idx + 1}${it.itemLabel ? ` — [${escapeHtml(it.itemLabel)}]` : ''}: ${escapeHtml(it.productTitle)}
                </div>
                <div style="font-size:0.76rem; color:#475569;">
                  Dimensions: <strong>${Number(it.widthMm).toLocaleString()} mm (W) × ${Number(it.projMm).toLocaleString()} mm (P)</strong> • Qty: <strong>${qty}</strong> × $${formatMoney(unitP)}
                </div>
              </div>
              <div style="font-weight:800; color:#0f172a; font-size:0.9rem; white-space:nowrap;">
                $${formatMoney(subP)}
              </div>
            </div>
            ${bRows}
          </div>`;
        }).join('');
      } else {
        const rowsHtml = (q.breakdown_items || []).map(item => `
          <div style="display:flex; justify-content:space-between; padding: 0.38rem 0; border-bottom: 1px dashed #e2e8f0;">
            <span>${escapeHtml(item.label)}</span>
            <strong style="color:#0f172a;">${escapeHtml(item.priceText)}</strong>
          </div>
        `).join('');
        bodyItemsHtml = `
          <div style="margin-bottom:0.75rem;">
            <div style="font-weight:800; color:#1d4ed8; font-size:0.9rem;">${escapeHtml(q.product_title)}</div>
            <div style="font-size:0.8rem; color:#475569;">Dimensions: <strong>${Number(q.width_mm).toLocaleString()} mm (W) × ${Number(q.proj_mm).toLocaleString()} mm (P)</strong></div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:9px; padding:0.65rem 0.85rem; margin-bottom:0.65rem;">
            ${rowsHtml}
          </div>
        `;
      }

      document.getElementById('qdModalBody').innerHTML = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; padding:0.75rem 0.9rem; margin-bottom:0.85rem;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size:0.8rem;">
            <div><strong>Client:</strong> ${escapeHtml(q.client_name)}</div>
            <div><strong>Phone:</strong> ${escapeHtml(q.client_phone || '-')}</div>
            <div><strong>Site Address:</strong> ${escapeHtml(q.site_address || '-')}</div>
            <div><strong>Sales Rep / Date:</strong> ${escapeHtml(q.author || '-')} (${dateStr})</div>
            ${q.form_state?.dealerName ? `<div style="grid-column: 1 / -1; color:#1e40af;"><strong>Company / Dealer:</strong> 🏢 ${escapeHtml(q.form_state.dealerName)} (${escapeHtml(q.form_state.dealerCode || '')})</div>` : ''}
          </div>
          ${q.memo ? `<div style="margin-top:0.45rem; padding-top:0.45rem; border-top:1px solid #e2e8f0; color:#475569;"><strong>Notes:</strong> ${escapeHtml(q.memo)}</div>` : ''}
        </div>
        ${bodyItemsHtml}
        <div style="border:1.5px solid #059669; background:#ecfdf5; border-radius:9px; padding:0.7rem 0.9rem; display:flex; justify-content:space-between; align-items:center; font-size:1.05rem; font-weight:800; color:#047857;">
          <span>Grand Total Estimated Price</span>
          <span>$${formatMoney(Number(q.total_price) || 0)}</span>
        </div>
      `;
      document.getElementById('quoteDetailModal')?.classList.add('open');
    }

    // Multi-Item Job Builder Event Listeners
    document.getElementById('addJobItemBtn')?.addEventListener('click', addOrUpdateJobItem);
    document.getElementById('jobItemLabelInput')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOrUpdateJobItem();
      }
    });
    document.getElementById('clearJobItemsBtn')?.addEventListener('click', function() {
      if (currentJobItems.length === 0) return;
      if (!confirm('Clear all items from the current quote list?')) return;
      currentJobItems = [];
      currentEditingJobItemIndex = null;
      renderJobItemsUI();
    });
    document.getElementById('jobItemsList')?.addEventListener('click', function(e) {
      const btn = e.target.closest('button[data-jaction]');
      if (!btn) return;
      const action = btn.dataset.jaction;
      const idx = parseInt(btn.dataset.jidx, 10);
      if (isNaN(idx) || !currentJobItems[idx]) return;

      if (action === 'edit') {
        currentEditingJobItemIndex = idx;
        const it = currentJobItems[idx];
        const labelInput = document.getElementById('jobItemLabelInput');
        const qtyInput = document.getElementById('jobItemQtyInput');
        if (labelInput) labelInput.value = it.itemLabel || '';
        if (qtyInput) qtyInput.value = it.qty || 1;
        if (it.formState) {
          applyFormStateToCalculator(it.formState, it.category);
        }
        renderJobItemsUI();
      } else if (action === 'delete') {
        currentJobItems.splice(idx, 1);
        if (currentEditingJobItemIndex === idx) {
          currentEditingJobItemIndex = null;
        } else if (currentEditingJobItemIndex !== null && currentEditingJobItemIndex > idx) {
          currentEditingJobItemIndex--;
        }
        renderJobItemsUI();
      }
    });
    document.getElementById('jobItemsList')?.addEventListener('change', function(e) {
      const inp = e.target.closest('input[data-jaction="qty"]');
      if (!inp) return;
      const idx = parseInt(inp.dataset.jidx, 10);
      if (isNaN(idx) || !currentJobItems[idx]) return;
      const newQty = Math.max(1, parseInt(inp.value, 10) || 1);
      currentJobItems[idx].qty = newQty;
      currentJobItems[idx].lineTotal = (Number(currentJobItems[idx].unitPrice) || 0) * newQty;
      renderJobItemsUI();
    });

    // Event Listeners for Save Quote & Detail Modals
    document.getElementById('openSaveQuoteModalBtn')?.addEventListener('click', openSaveQuoteModal);
    document.getElementById('cancelSaveQuoteBtn')?.addEventListener('click', closeSaveQuoteModal);
    document.getElementById('confirmSaveQuoteBtn')?.addEventListener('click', () => handleSaveQuoteSubmit(false));
    document.getElementById('updateExistingQuoteBtn')?.addEventListener('click', () => handleSaveQuoteSubmit(true));
    bindBackdropClose(document.getElementById('saveQuoteModal'), closeSaveQuoteModal);

    document.getElementById('copyQuoteTextBtn')?.addEventListener('click', function() {
      const txt = buildQuotePlainText(null);
      if (!txt) {
        alert('⚠️ No valid quote estimate available to copy.');
        return;
      }
      navigator.clipboard.writeText(txt).then(() => {
        alert('📋 Quote summary copied to clipboard.');
      });
    });

    document.getElementById('closeQuoteDetailBtn')?.addEventListener('click', () => {
      document.getElementById('quoteDetailModal')?.classList.remove('open');
    });
    bindBackdropClose(document.getElementById('quoteDetailModal'), () => {
      document.getElementById('quoteDetailModal')?.classList.remove('open');
    });
    document.getElementById('copyDetailQuoteTextBtn')?.addEventListener('click', function() {
      const q = savedQuotes.find(item => item.id === currentDetailModalQuoteId);
      if (!q) return;
      navigator.clipboard.writeText(buildQuotePlainText(q)).then(() => {
        alert('📋 Quote details copied to clipboard.');
      });
    });
    document.getElementById('printQuoteDetailBtn')?.addEventListener('click', function() {
      window.print();
    });
    document.getElementById('loadFromDetailModalBtn')?.addEventListener('click', function() {
      const q = savedQuotes.find(item => item.id === currentDetailModalQuoteId);
      if (!q) return;
      document.getElementById('quoteDetailModal')?.classList.remove('open');
      loadQuoteIntoCalculator(q);
    });

    // Event delegation for Saved Quotes List Actions
    document.getElementById('quotesListContainer')?.addEventListener('click', async function(e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const qid = btn.dataset.qid;
      const quote = savedQuotes.find(q => q.id === qid);
      if (!quote) return;

      if (action === 'load') {
        loadQuoteIntoCalculator(quote);
      } else if (action === 'detail') {
        openQuoteDetailModal(qid);
      } else if (action === 'delete') {
        if (!confirm(`Delete saved quote "${quote.quote_no} — ${quote.client_name}"?`)) return;
        savedQuotes = savedQuotes.filter(q => q.id !== qid);
        if (currentEditingQuoteId === qid) {
          currentEditingQuoteId = null;
          updateEditingBannerUI();
        }
        saveQuotesToLocal();
        renderSavedQuotesList();
        if (isSupabaseConfigured()) {
          try {
            await deleteQuoteFromSupabase(qid);
          } catch (err) {
            console.warn('Supabase delete error:', err);
          }
        }
      }
    });

    document.getElementById('quotesListContainer')?.addEventListener('change', async function(e) {
      const sel = e.target.closest('select[data-action="status"]');
      if (!sel) return;
      const qid = sel.dataset.qid;
      const quote = savedQuotes.find(q => q.id === qid);
      if (!quote) return;
      quote.status = sel.value;
      quote.updated_at = new Date().toISOString();
      saveQuotesToLocal();
      renderSavedQuotesList();
      if (isSupabaseConfigured()) {
        try {
          await upsertQuoteToSupabase(quote);
        } catch (err) {
          console.warn('Failed to update status on Supabase:', err);
        }
      }
    });

    document.getElementById('quoteSearchInput')?.addEventListener('input', renderSavedQuotesList);
    document.getElementById('quoteCategoryFilter')?.addEventListener('change', renderSavedQuotesList);
    document.getElementById('quoteStatusFilter')?.addEventListener('change', renderSavedQuotesList);
    document.getElementById('quoteDealerFilter')?.addEventListener('change', renderSavedQuotesList);
    document.getElementById('syncQuotesBtn')?.addEventListener('click', () => syncQuotesFromSupabase(true));

    // Export Saved Quotes to CSV (Excel) — exports only quotes visible to the active dealer/admin
    document.getElementById('exportQuotesCsvBtn')?.addEventListener('click', function() {
      const exportList = getVisibleQuotesForSession();
      if (exportList.length === 0) {
        alert('No saved quotes available to export for your account.');
        return;
      }
      const headers = ['Quote No', 'Company / Dealer', 'Status', 'Date', 'Client Name', 'Phone', 'Site Address', 'Sales Rep', 'Category', 'Product / Job Summary', 'Items Count', 'Width(mm)', 'Projection(mm)', 'Total Price($)', 'Itemized Summary', 'Notes'];
      const csvRows = [headers.join(',')];
      exportList.forEach(q => {
        const itemCount = Array.isArray(q.form_state?.items) ? q.form_state.items.length : 1;
        const row = [
          q.quote_no,
          q.form_state?.dealerName || '',
          q.status,
          q.updated_at ? new Date(q.updated_at).toLocaleDateString() : '',
          q.client_name,
          q.client_phone,
          q.site_address,
          q.author,
          q.category,
          q.product_title,
          itemCount,
          q.width_mm,
          q.proj_mm,
          q.total_price,
          q.summary_badge,
          q.memo
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`);
        csvRows.push(row.join(','));
      });
      const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saved_quotes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Supabase Config Modal Handlers
    function openSupabaseConfigModal() {
      if (activeAccessRole !== 'admin') {
        alert('🔒 Only HQ Master Admin can modify Cloud DB connection settings.');
        return;
      }
      const cfg = getSupabaseConfig();
      document.getElementById('sbUrlInput').value = cfg.url || '';
      document.getElementById('sbAnonKeyInput').value = cfg.anonKey || '';
      const msgEl = document.getElementById('sbConnectionTestMsg');
      if (msgEl) msgEl.style.display = 'none';
      document.getElementById('supabaseConfigModal')?.classList.add('open');
    }

    function closeSupabaseConfigModal() {
      document.getElementById('supabaseConfigModal')?.classList.remove('open');
    }

    document.getElementById('openSupabaseConfigModalBtn')?.addEventListener('click', openSupabaseConfigModal);
    document.getElementById('openSupabaseFromSettingsBtn')?.addEventListener('click', openSupabaseConfigModal);
    document.getElementById('cloudDbStatusPill')?.addEventListener('click', openSupabaseConfigModal);
    document.getElementById('closeSupabaseConfigBtn')?.addEventListener('click', closeSupabaseConfigModal);
    bindBackdropClose(document.getElementById('supabaseConfigModal'), closeSupabaseConfigModal);

    document.getElementById('copySupabaseSqlBtn')?.addEventListener('click', function() {
      const sql = document.getElementById('supabaseSetupSqlBox')?.textContent || '';
      navigator.clipboard.writeText(sql).then(() => {
        alert('📋 Supabase table setup SQL copied to clipboard.\nPaste it into [SQL Editor] in your Supabase dashboard and click [Run].');
      });
    });

    document.getElementById('saveSupabaseConfigBtn')?.addEventListener('click', async function() {
      const url = normalizeSupabaseUrl(document.getElementById('sbUrlInput').value);
      const anonKey = document.getElementById('sbAnonKeyInput').value.trim();
      const msgEl = document.getElementById('sbConnectionTestMsg');

      if (!url || !anonKey) {
        alert('Please enter both the Supabase Project URL and Publishable / Anon Public Key.');
        return;
      }

      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = '#eff6ff';
        msgEl.style.color = '#1d4ed8';
        msgEl.textContent = '🔄 Testing connection to Supabase server and verifying tables...';
      }

      try {
        await supabaseFetch('quotes?select=id&limit=1');
        if (msgEl) {
          msgEl.style.background = '#ecfdf5';
          msgEl.style.color = '#047857';
          msgEl.textContent = '✅ Connected! Real-time sync with Supabase Cloud DB is now active.';
        }
        await syncQuotesFromSupabase(false);
      } catch (err) {
        if (msgEl) {
          msgEl.style.background = '#fef2f2';
          msgEl.style.color = '#b91c1c';
          msgEl.textContent = `⚠️ Server response error: Please click [📋 Copy SQL] below and run the setup SQL in your Supabase SQL Editor first. (${err.message})`;
        }
      }
    });

    document.getElementById('disconnectSupabaseBtn')?.addEventListener('click', function() {
      if (!confirm('Disconnect from Supabase Cloud and switch to local browser storage mode?')) return;
      localStorage.removeItem(SUPABASE_CONFIG_KEY);
      updateCloudStatusUI('⚪ Local Mode (Browser Storage)', false);
      closeSupabaseConfigModal();
    });

    // Cloud Price Table Push / Pull via public.app_settings
    document.getElementById('pushPriceDbToCloudBtn')?.addEventListener('click', async function() {
      if (!isSupabaseConfigured()) {
        alert('Please configure and connect your Supabase Project URL and Key first.');
        return;
      }
      try {
        syncSharedOztechRefs();
        await supabaseFetch('app_settings', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            id: 'price_db_v1',
            payload: DB,
            updated_at: new Date().toISOString()
          })
        });
        alert('✅ Price table configuration uploaded to Supabase Cloud DB.');
      } catch (err) {
        alert(`⚠️ Failed to upload price tables: ${err.message}`);
      }
    });

    document.getElementById('pullPriceDbFromCloudBtn')?.addEventListener('click', async function() {
      if (!isSupabaseConfigured()) {
        alert('Please configure and connect your Supabase Project URL and Key first.');
        return;
      }
      try {
        const rows = await supabaseFetch('app_settings?id=eq.price_db_v1&select=*');
        if (!Array.isArray(rows) || rows.length === 0 || !rows[0].payload) {
          alert('No price table data has been uploaded to Cloud DB yet.');
          return;
        }
        deepMergeDb(DB, rows[0].payload);
        saveCustomDbToStorage();
        renderSettingsEditor();
        refreshCalculatorFromDb();
        alert('✅ Latest price tables pulled from Supabase Cloud DB and applied.');
      } catch (err) {
        alert(`⚠️ Failed to pull price tables: ${err.message}`);
      }
    });

    // Initialize Local Quotes, Dealer Accounts & Cloud Status on Startup
    loadDealersFromLocal();
    loadQuotesFromLocal();
    updateCloudStatusUI();
    if (isSupabaseConfigured()) {
      pullDealersAndAuthFromCloud();
      syncQuotesFromSupabase(false);
    }

    // Load any saved custom DB from localStorage & initialize Settings Filters
    loadCustomDbFromStorage();
    populateSettingsFilters();

    // Initial render
    populateDropASubModels();
    populateOztechSubModels();
    updateOztechModuleHints();
    populateFabricOptions();
    populateOperationOptions();
    populatePowderCoatOptions();
    renderBracketOptions();
    renderSensorOptions();
    renderTable();
    renderBracketReference();
    renderSensorReference();
    renderFabricReference();
    updateInputHints();
    calculatePrice(false);
