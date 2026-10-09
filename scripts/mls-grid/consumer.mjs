export function mortgagePayment(price, downPercent, annualRate, years) {
  if (![price, downPercent, annualRate, years].every(Number.isFinite) || price <= 0 || price > 1e10 || downPercent < 0 || downPercent > 100 || annualRate < 0 || annualRate > 100 || !Number.isInteger(years) || years < 1 || years > 50) throw new Error('Check the price, down payment, rate, and loan term.');
  const principal = price * (1 - downPercent / 100), months = years * 12, rate = annualRate / 1200;
  const payment = principal === 0 ? 0 : rate === 0 ? principal / months : principal * rate / -Math.expm1(-months * Math.log1p(rate));
  return { principal, downPayment: price - principal, payment, interest: Math.max(0, payment * months - principal) };
}
export function monthlyFee(amount, frequency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  if (amount === 0) return 0;
  const divisor = { monthly: 1, annually: 12, annual: 12, yearly: 12, quarterly: 3, 'semi-annually': 6, semiannually: 6 }[String(frequency).toLowerCase()];
  return divisor ? amount / divisor : null;
}
export function consumerProfile(l) {
  const type = l.PropertyType || '', subtype = `${l.PropertySubType || ''} ${l.OwnershipType || ''}`.toLowerCase();
  if (type === 'Residential Lease') return { key: 'rental', label: 'Rental', heading: 'Make your next move', section: 'Renting this home', fields: ['AvailabilityDate', 'LeaseTerm', 'SecurityDeposit', 'PetsAllowed', 'RentIncludes', 'TenantPays', 'LaundryFeatures', 'ParkingFeatures'] };
  if (type === 'Land') return { key: 'land', label: 'Land', heading: 'Start with the possibilities', section: 'Land & site information', fields: ['LotSizeAcres', 'LotSizeSquareFeet', 'Zoning', 'LotFeatures', 'Utilities', 'WaterSource', 'Sewer', 'WaterfrontFeatures'] };
  if (type === 'Commercial Lease') return { key: 'commercial-lease', label: 'Commercial lease', heading: 'Find space for your business', section: 'Lease terms & operating costs', fields: ['BuildingAreaTotal', 'BuildingAreaUnits', 'BusinessType', 'LeaseTerm', 'LeaseAmountFrequency', 'TenantPays', 'AvailabilityDate', 'ParkingTotal', 'AccessibilityFeatures', 'Zoning'] };
  if (type === 'Commercial Sale') return { key: 'commercial-sale', label: 'Commercial sale', heading: 'Find your next commercial property', section: 'Commercial ownership & site', fields: ['BusinessType', 'BuildingAreaTotal', 'BuildingAreaUnits', 'Zoning', 'TaxAnnualAmount', 'YearBuilt', 'ParkingTotal', 'AccessibilityFeatures', 'Utilities'] };
  if (type === 'Residential Income') return { key: 'investment', label: 'Multi-unit investment', heading: 'Understand the property. Evaluate the numbers.', section: 'Investment overview', fields: ['NumberOfUnitsTotal', 'GrossIncome', 'OperatingExpense', 'NetOperatingIncome', 'BuildingAreaTotal', 'TaxAnnualAmount', 'YearBuilt', 'ParkingTotal'] };
  if (/co-?op|cooperative/.test(subtype)) return { key: 'coop', label: 'Co-op', heading: 'Your apartment. Your building. Your next home.', section: 'Co-op ownership & building', fields: ['OwnershipType', 'AssociationFee', 'AssociationFeeFrequency', 'AssociationFeeIncludes', 'PetsAllowed', 'AssociationAmenities', 'LaundryFeatures', 'ParkingFeatures'] };
  if (/condominium|condo/.test(subtype)) return { key: 'condo', label: 'Condo', heading: 'Find the home that fits your life', section: 'Condo ownership & building', fields: ['AssociationFee', 'AssociationFeeFrequency', 'AssociationFeeIncludes', 'AssociationFee2', 'AssociationFee2Frequency', 'TaxAnnualAmount', 'PetsAllowed', 'AssociationAmenities'] };
  return { key: 'house', label: l.PropertySubType || 'Home', heading: 'A place to make your own', section: 'Home & outdoor space', fields: ['YearBuilt', 'LivingArea', 'LotSizeSquareFeet', 'ArchitecturalStyle', 'Stories', 'Basement', 'GarageSpaces', 'ParkingFeatures', 'ExteriorFeatures'] };
}
export function publicEmail(l) {
  const value = String(l.AttributionContact || '').trim();
  return /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value) && value.length <= 254 ? value : null;
}
export function publicMapURL(listing) {
  const { Latitude: latitude, Longitude: longitude } = listing;
  if (listing.addressWithheld || typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${latitude},${longitude}`);
  return url.href;
}
export function nyDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = key => parts.find(part => part.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function showingInstant(date, time) {
  if (typeof date !== 'string' || typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose a valid date and time.');
  const target = `${date}T${time}`, parts = target.match(/\d+/g).map(Number);
  const wall = Date.UTC(parts[0], parts[1]-1, parts[2], parts[3], parts[4]);
  let guess = wall;
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i=0; i<3; i++) {
    const p = formatter.format(new Date(guess)).match(/\d+/g).map(Number);
    guess += wall - Date.UTC(p[0], p[1]-1, p[2], p[3], p[4]);
  }
  if (formatter.format(new Date(guess)).replace(' ', 'T') !== target) throw new Error('Choose a valid date and time.');
  return new Date(guess).toISOString();
}
export function validateInquiry(data, now = new Date()) {
  if (!data || typeof data !== 'object' || !['tour', 'message'].includes(data.kind)) throw new Error('Choose a tour request or a message.');
  const text = (key, max) => typeof data[key] === 'string' ? data[key].trim().slice(0, max) : '';
  const name = text('name', 100), email = text('email', 254), phone = text('phone', 50), message = text('message', 2000);
  if (!name || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email)) throw new Error('Add your name and a valid email address.');
  if (data.kind === 'message' && !message) throw new Error('Add your question so we know how to help.');
  let requestedAt = null;
  if (data.kind === 'tour') {
    if (!/^(09|1[0-8]):(00|30)$/.test(data.time || '')) throw new Error('Choose a preferred time between 9:00 AM and 6:30 PM ET.');
    requestedAt = showingInstant(data.date, data.time);
    if (Date.parse(requestedAt) <= now.getTime() || Date.parse(requestedAt) > now.getTime() + 90 * 86400000) throw new Error('Choose a future date within the next 90 days.');
  }
  return { kind: data.kind, name, email, phone, message, requestedAt, timeZone: 'America/New_York' };
}

// Source calendar dates, never import time, determine recency.
export function recentListingDates(now = new Date()) {
  const today = nyDate(now);
  const start = Date.parse(today + 'T12:00:00Z');
  return Array.from({ length: 7 }, (_, i) => new Date(start - i * 86400000).toISOString().slice(0, 10));
}
export function listingSignals(listing, now = new Date()) {
  const current = listing.ListPrice, original = listing.OriginalListPrice;
  const belowOriginal = typeof current === 'number' && Number.isFinite(current) && current > 0 && typeof original === 'number' && Number.isFinite(original) && original > current ? original - current : null;
  const date = typeof listing.OnMarketDate === 'string' ? listing.OnMarketDate.slice(0, 10) : '';
  return { belowOriginal, recentlyListed: recentListingDates(now).includes(date), listedDate: date || null };
}

// A card is a summary of supplied facts; it does not infer investment returns or lease rates.
export function previewFields(listing) {
  const key = consumerProfile(listing).key;
  const fields = key.startsWith('commercial') ? ['BuildingAreaTotal','BuildingAreaUnits','BusinessType','Zoning']
    : key === 'investment' ? ['NumberOfUnitsTotal','YearBuilt','TaxAnnualAmount','NetOperatingIncome']
    : key === 'land' ? ['LotSizeAcres','LotSizeSquareFeet','Zoning','Utilities']
    : key === 'rental' ? ['PetsAllowed','LeaseTerm','RentIncludes'] : [];
  return fields.filter(field => listing[field] !== undefined && listing[field] !== null && listing[field] !== '' && (!Array.isArray(listing[field]) || listing[field].length));
}
