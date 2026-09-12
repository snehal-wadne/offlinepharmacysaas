/**
 * Tax & GST Service
 *
 * Manages tax definitions (GST rate slabs) and branch-specific GSTIN configuration.
 */

const { pool } = require('../db/connection');
const taxRepo = require('../repositories/tax.repository');
const branchGstRepo = require('../repositories/branch-gst.repository');

class TaxService {
  async _resolveBranchId(organisationId, branchId) {
    const isUuid = Boolean(branchId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId));
    if (isUuid) return branchId;

    const res = await pool.query(
      'SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at ASC LIMIT 1;',
      [organisationId]
    );
    if (res.rows.length > 0) {
      return res.rows[0].id;
    }
    const anyBranch = await pool.query('SELECT id FROM branches LIMIT 1;');
    return anyBranch.rows[0]?.id || branchId;
  }

  async getTaxes(organisationId) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }

    let taxes = await taxRepo.listTaxes(organisationId);

    // If no taxes exist yet for this organisation, seed standard Indian GST slabs
    if (taxes.length === 0) {
      const standardTaxes = [
        { name: 'GST 0%', taxType: 'CENTRAL_TAX', rate: 0.0, isDefault: false, description: 'Exempt items / Nil rated' },
        { name: 'GST 5%', taxType: 'CENTRAL_TAX', rate: 5.0, isDefault: false, description: 'Life-saving & standard medicines (2.5% CGST + 2.5% SGST)' },
        { name: 'GST 12%', taxType: 'CENTRAL_TAX', rate: 12.0, isDefault: true, description: 'Standard pharmaceutical formulation (6% CGST + 6% SGST)' },
        { name: 'GST 18%', taxType: 'CENTRAL_TAX', rate: 18.0, isDefault: false, description: 'Medical equipment & supplements (9% CGST + 9% SGST)' },
        { name: 'GST 28%', taxType: 'CENTRAL_TAX', rate: 28.0, isDefault: false, description: 'Luxury or non-essential wellness items' },
      ];

      for (const t of standardTaxes) {
        await taxRepo.createTax({
          organisationId,
          ...t,
        });
      }

      taxes = await taxRepo.listTaxes(organisationId);
    }

    return taxes;
  }

  async createTax(data) {
    const { organisationId, name, taxType, rate, isDefault, description } = data;
    if (!organisationId || !name) {
      throw new Error('organisationId and name are required');
    }

    return await taxRepo.createTax({
      organisationId,
      name: name.trim(),
      taxType: taxType || 'CENTRAL_TAX',
      rate: parseFloat(rate) || 0.0,
      isDefault: Boolean(isDefault),
      description: description || null,
    });
  }

  async getBranchGstSettings(organisationId, branchId) {
    if (!organisationId) {
      throw new Error('organisationId is required');
    }
    const resolvedBranchId = await this._resolveBranchId(organisationId, branchId);

    let settings = await branchGstRepo.getBranchGstSettings(organisationId, resolvedBranchId);
    if (!settings) {
      settings = {
        organisationId,
        branchId: resolvedBranchId,
        gstin: '27AABCU9603R1ZM',
        legalName: 'Falah Healthcare Private Limited',
        tradeName: 'Falah Pharmacy & Wellness',
        state: 'Maharashtra',
        stateCode: '27',
        gstScheme: 'REGULAR',
        status: 'ACTIVE',
      };
    }

    return settings;
  }

  async updateBranchGstSettings(data) {
    const {
      organisationId,
      branchId,
      gstin,
      legalName,
      tradeName,
      state,
      stateCode,
      gstScheme,
    } = data;

    if (!organisationId || !gstin) {
      throw new Error('organisationId and gstin are required');
    }
    const resolvedBranchId = await this._resolveBranchId(organisationId, branchId);

    const existing = await branchGstRepo.getBranchGstSettings(organisationId, resolvedBranchId);
    if (existing) {
      return await branchGstRepo.updateBranchGstSettings(organisationId, resolvedBranchId, {
        gstin: gstin.trim().toUpperCase(),
        legalName: legalName || existing.legal_name,
        tradeName: tradeName || existing.trade_name,
        state: state || existing.state || 'Maharashtra',
        stateCode: stateCode || existing.state_code || '27',
        gstScheme: gstScheme || existing.gst_scheme || 'REGULAR',
      });
    } else {
      return await branchGstRepo.createBranchGstSettings({
        organisationId,
        branchId: resolvedBranchId,
        gstin: gstin.trim().toUpperCase(),
        legalName: legalName || 'Falah Healthcare Private Limited',
        tradeName: tradeName || 'Falah Pharmacy & Wellness',
        state: state || 'Maharashtra',
        stateCode: stateCode || '27',
        gstScheme: gstScheme || 'REGULAR',
      });
    }
  }

  async updateTax(organisationId, taxId, updates) {
    if (!organisationId || !taxId) {
      throw new Error('organisationId and taxId are required');
    }
    return await taxRepo.updateTax(organisationId, taxId, updates);
  }

  async setTaxStatus(organisationId, taxId, isActive) {
    if (!organisationId || !taxId) {
      throw new Error('organisationId and taxId are required');
    }
    return await taxRepo.setTaxStatus(organisationId, taxId, Boolean(isActive));
  }

  async deleteTax(organisationId, taxId) {
    if (!organisationId || !taxId) {
      throw new Error('organisationId and taxId are required');
    }
    return await taxRepo.deleteTax(organisationId, taxId);
  }
}

module.exports = new TaxService();
