async function run() {
  const res = await fetch('https://inventory.primeamericarealestate.com/api/projects');
  const data = await res.json();
  let sql = '';
  for (const l of data.listings) {
    if (l.price) {
      sql += `UPDATE transactions SET price = ${l.price} WHERE inventory_listing_id = '${l.id}' AND price IS NULL;\n`;
    }
  }
  console.log(sql);
}
run();
