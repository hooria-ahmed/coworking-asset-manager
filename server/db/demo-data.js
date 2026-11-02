// Optional demo data for presentations: more members, assets, past loans, bookings, overdue items and
// repair records, all dated relative to today so the dashboard and reports always look alive.
// Run AFTER `npm run db:setup`:   node db/demo-data.js     (it adds to the sample data; run it once)
// Every demo member's password is Member@123.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

const MEMBERS = [
  ['Ayesha Khan', 'ayesha@cowork.local', '03211234567'],
  ['Bilal Ahmed', 'bilal@cowork.local', '03331234567'],
  ['Sara Malik', 'sara@cowork.local', '03451234567'],
  ['Usman Tariq', 'usman@cowork.local', '03001234567'],
];

const CATEGORIES = [['Audio', 'Microphones, speakers and headsets'], ['Tablet', 'iPads and drawing tablets']];

// [tag, name, category, location, condition, description]
const ASSETS = [
  ['LAP-004', 'HP EliteBook 840 G10', 'Laptop', 'Floor 1 - Store Room', 'Good', '16 GB RAM, Core i5, 14 inch. Office work, Zoom calls and presentations.'],
  ['LAP-005', 'ASUS ROG Zephyrus G14', 'Laptop', 'Floor 2 - Store Room', 'New', 'Ryzen 9, RTX 4060, 32 GB RAM. 3D rendering, Blender and video editing.'],
  ['DSK-002', 'Apple iMac 24 (M3)', 'Desktop Computer', 'Floor 2 - Media Room', 'New', '24 inch 4.5K Retina, 16 GB RAM. Design and photo editing.'],
  ['PRJ-003', 'Anker Nebula Capsule 3', 'Projector', 'Floor 1 - Reception', 'Good', 'Portable 1080p projector with battery. Small meetings and movie nights.'],
  ['CAM-002', 'Sony ZV-E10 Vlog Kit', 'Camera', 'Floor 2 - Media Room', 'Good', 'Mirrorless camera with 16-50 mm lens and shotgun mic. YouTube and reels.'],
  ['CAM-003', 'GoPro HERO12 Black', 'Camera', 'Floor 2 - Media Room', 'Good', '5.3K action camera with chest mount and spare batteries.'],
  ['AUD-001', 'Rode Wireless GO II', 'Audio', 'Floor 2 - Media Room', 'Good', 'Dual wireless lapel microphones for interviews and podcasts.'],
  ['AUD-002', 'Jabra Speak 710', 'Audio', 'Floor 1 - Meeting Room', 'Fair', 'Bluetooth conference speakerphone for up to 6 people.'],
  ['CBL-003', 'Anker 100W USB-C Charger', 'Cable & Adapter', 'Floor 1 - Reception', 'New', '4 ports, charges laptops and phones together.'],
  ['CBL-004', '6-Way Extension Board', 'Cable & Adapter', 'Floor 1 - Reception', 'Good', 'Surge protected, 3 m cable.'],
  ['LAB-002', 'Raspberry Pi 5 Kit', 'Lab Equipment', 'Floor 1 - Lab A', 'New', '8 GB board, case, power supply and 64 GB card. IoT projects.'],
  ['LAB-003', 'Fluke 101 Multimeter', 'Lab Equipment', 'Floor 1 - Lab A', 'Good', 'Digital multimeter for electronics work.'],
  ['TAB-001', 'iPad Air 11 (M2)', 'Tablet', 'Floor 1 - Store Room', 'New', 'With Apple Pencil Pro. Sketching, notes and client demos.'],
  ['TAB-002', 'Wacom Intuos Pro M', 'Tablet', 'Floor 2 - Media Room', 'Good', 'Pen tablet for illustration and photo retouching.'],
  ['LAP-000', 'Dell Inspiron 15 (2017)', 'Laptop', 'Floor 1 - Store Room', 'Damaged', 'Old 8 GB laptop. Battery no longer holds charge.'],
];

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'asset_manager', dateStrings: true,
  });
  const one = async (sql, p = []) => (await db.query(sql, p))[0][0];
  const [[{ password_hash: hash }]] = await db.query("SELECT password_hash FROM users WHERE email = 'member@cowork.local'");
  const admin = (await one("SELECT user_id FROM users WHERE role = 'Admin' ORDER BY user_id LIMIT 1")).user_id;

  for (const [name, email, phone] of MEMBERS) {
    await db.query(
      "INSERT INTO users (name, email, contact_no, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'Member', NOW() - INTERVAL 70 DAY)",
      [name, email, phone, hash]
    );
  }
  for (const [name, desc] of CATEGORIES) await db.query('INSERT INTO categories (name, description) VALUES (?, ?)', [name, desc]);
  for (const [tag, name, cat, loc, cond, desc] of ASSETS) {
    await db.query(
      `INSERT INTO assets (asset_tag, name, category_id, location, \`condition\`, status, description, created_at)
       VALUES (?, ?, (SELECT category_id FROM categories WHERE name = ?), ?, ?, 'Available', ?, NOW() - INTERVAL 80 DAY)`,
      [tag, name, cat, loc, cond, desc]
    );
  }
  await db.query("UPDATE assets SET created_at = NOW() - INTERVAL 90 DAY WHERE created_at > NOW() - INTERVAL 1 DAY");

  const U = Object.fromEntries((await db.query('SELECT user_id, email FROM users'))[0].map((u) => [u.email.split('@')[0], u.user_id]));
  const A = Object.fromEntries((await db.query('SELECT asset_id, asset_tag FROM assets'))[0].map((a) => [a.asset_tag, a.asset_id]));

  // A request; when issued, a borrow record. offsets are days from today.
  async function booking({ user, tag, purpose, start, days, status = 'Completed', issue = false, returned = null, cond = 'Good', borrow = null }) {
    const [r] = await db.query(
      `INSERT INTO asset_requests (user_id, asset_id, purpose, start_date, end_date, status, decided_by, decided_at, created_at)
       VALUES (?, ?, ?, CURDATE() + INTERVAL ? DAY, CURDATE() + INTERVAL ? DAY, ?, ?, ?, NOW() + INTERVAL ? DAY - INTERVAL 5 HOUR)`,
      [U[user], A[tag], purpose, start, start + days - 1, status, status === 'Pending' ? null : admin,
        status === 'Pending' ? null : new Date(Date.now() + (start - 1) * 864e5), start - 2]
    );
    if (!issue) return r.insertId;
    await db.query(
      `INSERT INTO borrow_records (request_id, asset_id, user_id, issued_at, due_date, returned_at, return_condition, status)
       VALUES (?, ?, ?, NOW() + INTERVAL ? DAY - INTERVAL 3 HOUR, CURDATE() + INTERVAL ? DAY, ${returned === null ? 'NULL' : 'NOW() + INTERVAL ? DAY - INTERVAL 1 HOUR'}, ?, ?)`,
      [r.insertId, A[tag], U[user], start, start + days - 1, ...(returned === null ? [] : [returned]), returned === null ? null : cond,
        borrow || (returned === null ? 'Active' : 'Returned')]
    );
    return r.insertId;
  }

  // Past loans (completed) spread over the last two months, for the usage charts.
  const past = [
    ['ayesha', 'LAP-001', 'Client video edit', -58, 3], ['bilal', 'PRJ-001', 'Team workshop', -55, 1], ['sara', 'CAM-001', 'Product shoot', -52, 2],
    ['usman', 'LAB-001', 'Arduino class', -50, 5], ['member', 'LAP-002', 'Final Cut project', -47, 4], ['ayesha', 'AUD-001', 'Podcast recording', -45, 1],
    ['bilal', 'LAP-004', 'Remote interview', -42, 2], ['sara', 'DSK-002', 'Poster design', -40, 3], ['usman', 'LAP-005', '3D model render', -38, 4],
    ['member', 'CBL-001', 'Pitch day', -36, 1], ['ayesha', 'CAM-002', 'Reels for a café', -33, 2], ['bilal', 'PRJ-001', 'Monthly town hall', -30, 1],
    ['sara', 'TAB-001', 'Client sketches', -28, 5], ['usman', 'LAB-002', 'IoT prototype', -26, 7], ['member', 'LAP-001', 'Wedding highlight video', -24, 3],
    ['ayesha', 'CAM-003', 'Hiking vlog', -21, 2], ['bilal', 'AUD-002', 'Investor call', -19, 1], ['sara', 'LAP-002', 'Motion graphics', -17, 4],
    ['usman', 'LAB-003', 'Circuit testing', -15, 2], ['member', 'PRJ-003', 'Movie night', -13, 1], ['ayesha', 'LAP-005', 'Game jam', -11, 3],
    ['bilal', 'CBL-002', 'Demo to client', -9, 1], ['sara', 'CAM-001', 'Event photos', -8, 2], ['usman', 'DSK-001', 'Rendering', -7, 3],
    ['member', 'TAB-002', 'Logo retouch', -6, 2], ['ayesha', 'AUD-001', 'Interview series', -5, 2],
  ];
  for (const [user, tag, purpose, start, days] of past) {
    await booking({ user, tag, purpose, start, days, issue: true, returned: start + days - 1 });
  }

  // Damaged returns in the past that were repaired (closed maintenance with cost).
  await booking({ user: 'usman', tag: 'LAB-001', purpose: 'Robotics weekend', start: -20, days: 2, issue: true, returned: -19, cond: 'Damaged' });
  await booking({ user: 'bilal', tag: 'CAM-003', purpose: 'Bike ride footage', start: -14, days: 2, issue: true, returned: -13, cond: 'Damaged' });
  const maint = async (tag, by, issue, notes, cost, status, outcome, reported, resolved) => db.query(
    `INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, notes, cost, status, outcome, reported_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? DAY, ${resolved === null ? 'NULL' : 'NOW() + INTERVAL ? DAY'})`,
    [A[tag], by, issue, notes, cost, status, outcome, reported, ...(resolved === null ? [] : [resolved])]
  );
  await maint('LAB-001', admin, 'Returned damaged by Usman Tariq: two jumper wires and the LCD missing', 'Replaced the LCD and wires from spare stock.', 1850, 'Closed', 'Repaired', -19, -17);
  await maint('CAM-003', admin, 'Returned damaged by Bilal Ahmed: lens cover scratched', 'New lens cover from the GoPro service centre.', 3200, 'Closed', 'Repaired', -13, -10);
  await maint('LAP-000', admin, 'Battery swells and the laptop shuts down after 5 minutes', 'Battery discontinued. Not worth repairing.', 0, 'Closed', 'Retired', -30, -27);
  await db.query("UPDATE assets SET status = 'Retired' WHERE asset_tag = 'LAP-000'");
  // Open records: the seed BenQ projector, a damaged return waiting, and work in progress.
  await db.query('DELETE FROM maintenance_logs WHERE asset_id = ?', [A['PRJ-002']]); // replaced by the fuller record below
  await maint('PRJ-002', admin, 'Lamp flickers after 10 minutes of use', 'Replacement lamp ordered from the BenQ dealer. Expected Friday.', 4500, 'In Progress', null, -6, null);
  await booking({ user: 'sara', tag: 'AUD-002', purpose: 'Board meeting', start: -3, days: 1, issue: true, returned: -3, cond: 'Damaged' });
  await maint('AUD-002', admin, 'Returned damaged by Sara Malik: speaker crackles at high volume', null, 0, 'Open', null, -3, null);
  await db.query("UPDATE assets SET status = 'Under Maintenance', `condition` = 'Damaged' WHERE asset_tag = 'AUD-002'");

  // On loan now: Test Member has the Dell XPS (due in 2 days); Ayesha has the Canon (and reported a problem).
  await booking({ user: 'member', tag: 'LAP-001', purpose: 'Editing a client documentary', start: -1, days: 4, status: 'Approved', issue: true });
  await booking({ user: 'ayesha', tag: 'CAM-001', purpose: 'Fashion shoot', start: -2, days: 5, status: 'Approved', issue: true });
  await booking({ user: 'usman', tag: 'LAP-005', purpose: 'Blender animation', start: -2, days: 3, status: 'Approved', issue: true });
  await db.query("UPDATE assets SET status = 'Borrowed' WHERE asset_tag IN ('LAP-001', 'CAM-001', 'LAP-005')");
  await maint('CAM-001', U.ayesha, 'Autofocus hunts in low light and the battery door does not close', null, 0, 'Open', null, 0, null);
  // Overdue: Bilal still has the USB-C adapter, due 2 days ago.
  await booking({ user: 'bilal', tag: 'CBL-002', purpose: 'Client presentation', start: -5, days: 3, status: 'Approved', issue: true, borrow: 'Overdue' });
  await db.query("UPDATE assets SET status = 'Borrowed' WHERE asset_tag = 'CBL-002'");

  // Approved bookings waiting to be collected, and pending requests for the Approvals screen.
  await booking({ user: 'sara', tag: 'PRJ-001', purpose: 'Design sprint demo', start: 0, days: 1, status: 'Approved' });
  await booking({ user: 'ayesha', tag: 'DSK-002', purpose: 'Brand guide design', start: 3, days: 4, status: 'Approved' });
  await booking({ user: 'member', tag: 'TAB-001', purpose: 'Sketching wireframes', start: 6, days: 3, status: 'Approved' });
  await db.query("UPDATE assets SET status = 'Reserved' WHERE asset_tag IN ('PRJ-001', 'DSK-002', 'TAB-001')");
  await booking({ user: 'bilal', tag: 'LAP-002', purpose: 'Editing the launch video', start: 1, days: 3, status: 'Pending' });
  await booking({ user: 'usman', tag: 'LAB-002', purpose: 'Smart plant monitor project', start: 2, days: 7, status: 'Pending' });
  await booking({ user: 'sara', tag: 'CAM-002', purpose: 'Instagram reels for a client', start: 4, days: 2, status: 'Pending' });
  await booking({ user: 'ayesha', tag: 'LAP-002', purpose: 'Colour grading', start: 2, days: 2, status: 'Rejected' });
  await db.query("UPDATE asset_requests SET rejection_reason = 'Overlaps an earlier request' WHERE status = 'Rejected'");

  // A few notifications and AI questions so those screens are not empty.
  const note = (user, type, msg, ago) => db.query('INSERT INTO notifications (user_id, type, message, created_at) VALUES (?, ?, ?, NOW() - INTERVAL ? HOUR)', [user, type, msg, ago]);
  await note(admin, 'problem_report', 'Ayesha Khan reported a problem with Canon EOS R50 (CAM-001): autofocus hunts in low light', 2);
  await note(admin, 'new_request', 'Sara Malik requested Sony ZV-E10 Vlog Kit for 2 days', 3);
  await note(U.member, 'request_approved', 'Your request for iPad Air 11 (M2) was approved. Collect it from Floor 1 - Store Room.', 20);
  await note(U.member, 'asset_issued', 'You collected Dell XPS 15. Please return it by the due date.', 26);
  const ai = (user, feature, prompt, response, ago) => db.query(
    'INSERT INTO ai_chat_logs (user_id, feature, prompt, response, created_at) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? HOUR)', [user, feature, prompt, response, ago]
  );
  await ai(U.member, 'Assistant', 'Which projectors are free this week?', 'Anker Nebula Capsule 3 is available all week. Epson EB-X51 is booked today.', 30);
  await ai(U.ayesha, 'Recommendation', 'Laptop for video editing for 3 days', 'Ranked: MacBook Pro 14, ASUS ROG Zephyrus G14', 50);
  await ai(U.sara, 'Assistant', 'Do you have a drawing tablet?', 'Yes: Wacom Intuos Pro M and iPad Air 11 (M2) with Apple Pencil.', 75);

  await db.end();
  console.log(`Demo data added: ${MEMBERS.length} members, ${ASSETS.length} assets, ${past.length + 9} loans, bookings and repair records.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
