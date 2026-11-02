USE asset_manager;

INSERT INTO categories (name, description) VALUES
 ('Laptop', 'Portable computers'),
 ('Desktop Computer', 'Fixed workstations'),
 ('Projector', 'Projectors and screens'),
 ('Camera', 'Photo and video cameras'),
 ('Cable & Adapter', 'HDMI, USB-C and power adapters'),
 ('Lab Equipment', 'Electronics and lab kits');

INSERT INTO assets (asset_tag, name, category_id, location, `condition`, status, description) VALUES
 ('LAP-001', 'Dell XPS 15', 1, 'Floor 1 - Store Room', 'Good', 'Available', '16 GB RAM, i7, NVIDIA GTX 1650. Good for video editing.'),
 ('LAP-002', 'MacBook Pro 14', 1, 'Floor 2 - Store Room', 'New', 'Available', 'M3 Pro, 18 GB RAM. Final Cut Pro installed.'),
 ('LAP-003', 'Lenovo ThinkPad E14', 1, 'Floor 2 - Store Room', 'Fair', 'Available', '8 GB RAM, office work and browsing.'),
 ('DSK-001', 'HP Z2 Workstation', 2, 'Floor 1 - Lab A', 'Good', 'Available', '32 GB RAM, RTX 3060, 3D rendering.'),
 ('PRJ-001', 'Epson EB-X51 Projector', 3, 'Floor 1 - Meeting Room', 'Good', 'Available', '3800 lumens, HDMI.'),
 ('PRJ-002', 'BenQ MW560 Projector', 3, 'Floor 2 - Conference Hall', 'Fair', 'Under Maintenance', 'Lamp flickers.'),
 ('CAM-001', 'Canon EOS R50', 4, 'Floor 2 - Media Room', 'New', 'Available', '4K video, with tripod.'),
 ('CBL-001', 'HDMI Cable 3m', 5, 'Floor 1 - Reception', 'Good', 'Available', 'High-speed HDMI 2.1.'),
 ('CBL-002', 'USB-C to HDMI Adapter', 5, 'Floor 1 - Reception', 'Good', 'Available', '4K at 60 Hz.'),
 ('LAB-001', 'Arduino Starter Kit', 6, 'Floor 1 - Lab A', 'Good', 'Available', 'Uno board, sensors, breadboard.');
