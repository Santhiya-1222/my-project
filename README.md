# EatClub (College Food Court Ordering)

Simple web app for college students to order food, with admin controls.

## Features
- **Two roles**: admin, student
- **Admin**: hardcoded login (no registration)
- **Student**: must register first (name, email, roll number, password)
- **Time-based ordering**:
  - Before **10:00 AM**: afternoon ordering **enabled**
  - **10:00 AM – 2:00 PM**: ordering **disabled**
  - After **2:00 PM**: evening ordering **enabled**
- **Admin**:
  - Add / delete food items
  - Change prices
  - Set items available / not available
  - View all orders
- **Student**:
  - View afternoon + evening menu
  - Order items (only when ordering window is open)
  - Choose **Online** (simulated) or **Offline** payment
  - View own orders

## Setup (Windows)
1. Install Node.js (LTS).
2. In this folder, run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`

## Default accounts
- **Admin**: `kc@6213` / `kc6213`
- **Student**: register first, then login with **email + password**

## Data
- JSON DB file: `data.json` (auto-created)

## Cart
Student cart is stored in the browser `localStorage` under key `eatclub_cart_v1`.

