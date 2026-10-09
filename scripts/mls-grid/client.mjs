// Server-side replication client. Never import this module into the browser bundle.
const ENDPOINTS = new Set(['https://api-demo.mlsgrid.com/v2', 'https://api.mlsgrid.com/v2']);

export function createRequestPacer(pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let lastRequest = 0;
  return async () => {
    await pause(Math.max(0, 550 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
  };
}

export function createClient({ token, source, endpoint = 'https://api-demo.mlsgrid.com/v2', fetcher = fetch, pause, beforeRequest = createRequestPacer(pause), pageSize = 20 }) {
  if (!token || !/^[a-z0-9_-]+$/.test(source || '') || !ENDPOINTS.has(endpoint) || !Number.isInteger(pageSize) || pageSize<1 || pageSize>1000) {
    throw new Error('Provide a token, valid source, and approved MLS Grid endpoint');
  }
  const initial = (timestamp = null, {viewOnly = true} = {}) => {
    const url = new URL(`${endpoint}/Property`);
    let filter = `OriginatingSystemName eq '${source}'`;
    if (timestamp) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid replication timestamp');
      filter += ` and ModificationTimestamp gt ${timestamp}`;
    } else if(viewOnly) filter += ' and MlgCanView eq true';
    url.searchParams.set('$filter', filter);
    url.searchParams.set('$expand', 'Media,Rooms,UnitTypes');
    // Small media-expanded pages can be downloaded before their signed URLs expire.
    url.searchParams.set('$top', String(pageSize));
    return url.href;
  };
  const validateLink = link => {
    const url = new URL(link, `${endpoint}/`);
    if (url.origin !== new URL(endpoint).origin || url.pathname !== '/v2/Property' || url.username || url.password || url.hash || !url.searchParams.get('$filter')?.includes(`OriginatingSystemName eq '${source}'`)) {
      throw new Error('Rejected unsafe or mismatched MLS Grid pagination URL');
    }
    return url.href;
  };
  return {
    initial,
    properties(ids) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Invalid media backfill identifiers');
      const url = new URL(initial());
      url.searchParams.set('$filter', `OriginatingSystemName eq '${source}' and ListingId in (${ids.map(id => `'${id}'`).join(',')})`);
      return url.href;
    },
    async page(link) {
      const url = validateLink(link);
      await beforeRequest();
      let response;
      try {
        response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'gzip,deflate' },
          redirect: 'manual', signal: AbortSignal.timeout(30_000),
        });
      } catch { throw new Error('MLS Grid connection failed; checkpoint retained'); }
      if (!response.ok) throw new Error(`MLS Grid returned HTTP ${response.status}; checkpoint retained`);
      // Bound decompressed size as well as record count, even if upstream ignores $top.
      if (!response.body) throw new Error('MLS Grid returned an empty response');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32 * 1024 * 1024) throw new Error('MLS Grid page exceeded the development size limit');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new Error('Invalid MLS Grid JSON; checkpoint retained'); }
      if (!data || !Array.isArray(data.value) || data.value.length > 1000) throw new Error('Invalid MLS Grid page');
      for (const row of data.value) {
        if (!row || row.OriginatingSystemName !== source || typeof row.ListingKey !== 'string' || !row.ListingKey || typeof row.MlgCanView !== 'boolean' || typeof row.ModificationTimestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(row.ModificationTimestamp) || !Number.isFinite(Date.parse(row.ModificationTimestamp))) {
          throw new Error('Invalid MLS Grid record; checkpoint retained');
        }
      }
      const next = data['@odata.nextLink'] ? validateLink(data['@odata.nextLink']) : null;
      if (next === url) throw new Error('MLS Grid returned a repeated pagination URL');
      return { rows: data.value, next };
    },
  };
}

// Explicit development field inventory; never copy an unreviewed source record into the browser.
// Production requires each MLS's authorized IDX field inventory, including local fields.
export const PUBLIC_FIELDS = ['ListingId', 'StandardStatus', 'ListPrice', 'OriginalListPrice', 'ClosePrice', 'CloseDate', 'PropertyType', 'PropertySubType', 'OwnershipType', 'BedroomsTotal', 'BathroomsTotalInteger', 'BathroomsFull', 'BathroomsHalf', 'LivingArea', 'LivingAreaUnits', 'LivingAreaSource', 'LotSizeSquareFeet', 'LotSizeAcres', 'LotSizeUnits', 'LotSizeSource', 'City', 'CountyOrParish', 'StateOrProvince', 'PostalCode', 'PublicRemarks', 'ListOfficeName', 'ListOfficePhone', 'ListAgentFullName', 'AttributionContact', 'ModificationTimestamp', 'OnMarketDate', 'DaysOnMarket', 'AssociationFee', 'AssociationFeeFrequency', 'AssociationFeeIncludes', 'AssociationFee2', 'AssociationFee2Frequency', 'TaxAnnualAmount', 'TaxYear', 'TaxLegalDescription', 'ParkingTotal', 'YearBuilt', 'YearBuiltSource', 'Stories', 'StoriesTotal', 'NumberOfUnitsTotal', 'RoomsTotal', 'GarageSpaces', 'CarportSpaces', 'ArchitecturalStyle', 'Cooling', 'Heating', 'Appliances', 'InteriorFeatures', 'ExteriorFeatures', 'LaundryFeatures', 'ParkingFeatures', 'Basement', 'Flooring', 'WaterSource', 'Sewer', 'Utilities', 'LotFeatures', 'View', 'WaterfrontYN', 'WaterfrontFeatures', 'PoolFeatures', 'AccessibilityFeatures', 'PetsAllowed', 'AssociationAmenities', 'ElementarySchool', 'MiddleOrJuniorSchool', 'HighSchool', 'HighSchoolDistrict', 'LeaseTerm', 'LeaseAmountFrequency', 'AvailabilityDate', 'SecurityDeposit', 'RentIncludes', 'TenantPays', 'Zoning', 'BusinessType', 'BuildingAreaTotal', 'BuildingAreaUnits', 'GrossIncome', 'OperatingExpense', 'NetOperatingIncome'];
const ADDRESS_FIELDS = ['UnparsedAddress', 'StreetNumber', 'StreetNumberNumeric', 'StreetDirPrefix', 'StreetName', 'StreetSuffix', 'StreetDirSuffix', 'UnitNumber', 'Latitude', 'Longitude'];

export function publicProjection(row) {
  if (row.MlgCanView !== true || row.InternetEntireListingDisplayYN === false || !Array.isArray(row.MlgCanUse) || !row.MlgCanUse.some(use => typeof use === 'string' && use.toLowerCase() === 'idx')) return null;
  const projected = { id: row.ListingKey, source: row.OriginatingSystemName, addressWithheld: row.InternetAddressDisplayYN === false };
  for (const field of [...PUBLIC_FIELDS, ...(projected.addressWithheld ? [] : ADDRESS_FIELDS)]) {
    const value = row[field];
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) projected[field] = value;
    else if (Array.isArray(value) && value.every(item => typeof item === 'string')) projected[field] = value;
  }
  // Internal identifiers keep their prefix. Only the consumer-facing OneKey MLS number is stripped.
  if (row.OriginatingSystemName === 'onekey2' && typeof projected.ListingId === 'string') projected.ListingId = projected.ListingId.replace(/^KEY/, '');
  // Withheld addresses may also occur in unrestricted text. Suppress that text in this preview
  // until the source supplies a reviewed safe version. Never release location-bearing legal text.
  if (projected.addressWithheld) {
    delete projected.PublicRemarks;
    delete projected.TaxLegalDescription;
  }
  // Media URLs stay server-side; galleries use the local eligible media manifest.
  return projected;
}
