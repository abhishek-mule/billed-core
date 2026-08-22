BILLZO UI/UX CONSTITUTION
Minimal Merchant Operating System

Design Inspiration:

Stripe Dashboard → Clarity, hierarchy, whitespace, confidence.
Linear → Speed, keyboard-first thinking, minimal visual noise.
Mercury → Modern financial interface, clean data presentation.

Not Inspired By:

Traditional ERP dashboards.
Government portals.
Overcrowded accounting software.
AI-generated cards and meaningless charts.
1. Core Product Philosophy

BillZo is not a software.

BillZo is a Merchant Operating System.

A merchant should open BillZo and immediately understand:

What money came in?
What money is stuck?
Which customer needs attention?
What should I do next?

Every screen must answer:

"What action does the merchant need to take right now?"

If a component does not create clarity or action, remove it.

2. Global Application Layout
┌─────────────────────────────────────────────┐
│ Top Navigation Bar                           │
├───────┬─────────────────────────────────────┤
│       │                                     │
│       │                                     │
│Sidebar│        Active Module                 │
│       │                                     │
│       │                                     │
└───────┴─────────────────────────────────────┘
3. Top Navigation Bar

Fixed at top.

Height:

Desktop: 64px
Mobile: 56px

Never overloaded.

Left Section
Hamburger Menu

Mobile:

Opens sidebar drawer.
First element.

Desktop:

Collapses sidebar.
BillZo Logo

Order:

☰ BillZo

Logo should communicate:

Trust
Finance
Simplicity

No large branding.

Center Section
Global Search

Purpose:

"Take me anywhere."

Search:

Invoice number
Customer name
Product name
Phone number
Payment ID

Desktop:

Large centered search.

Example:

🔍 Search invoices, parties, products...

Mobile:

Search icon opens full-screen search.

Right Section
Notifications

Bell icon.

Only important alerts.

Examples:

Payment received
Customer replied
Payment promise broken
Reminder failed
Inventory low

Do NOT notify:

Every invoice created.
Every routine action.
Quick Actions

Optional floating button.

Examples:

+ New Invoice
+ Record Payment
+ Add Party
Merchant Profile

Small avatar.

Dropdown:

Business name
Subscription
WhatsApp status
Settings
Logout
4. Sidebar Navigation

Order represents merchant workflow.

🏠 Home

💰 Cashflow

💵 Payments

📄 Invoices

🧾 POS

👥 Parties

📦 Products

📊 Reports


----------------


⚙ Settings
Sidebar Principles

Do not create nested menus.

Maximum depth:

Module
  └── Sub-page

No ERP-style trees.

Example bad:

Inventory
 ├ Stocks
 ├ Categories
 ├ Batches
 ├ Suppliers
 └ Adjustments

Good:

Products
    → Product details
5. Common Module Structure

Every module follows:

HEADER

ACTION BAR

CONTENT AREA
Header

Contains:

Module Name

Short description

Example:

Invoices

Create, manage and track your bills
Action Bar

Contains:

Left:

Search
Filters

Right:

Primary Action Button

Example:

[Search invoices]

          [ + Create Invoice ]
6. Home Module

Purpose:

Merchant command center.

Do NOT show 20 cards.

Sections:

A. Welcome + Business Snapshot

Example:

Good Morning, Ramesh

Today your business has:

₹52,000 To Collect
₹18,000 Received Today
12 Pending Invoices
B. Cash Position

Simple view:

Money In

Money Out

Net Cash
C. Priority Actions

The most important area.

Examples:

⚠ 5 customers need follow-up

📞 Call Ramesh Traders

💬 Send reminder to Mohan Stores
D. Recent Activity

Timeline:

10:30 Payment received

9:20 Invoice created

Yesterday Customer promised payment
7. Cashflow Module

Purpose:

Understand movement of money.

Sections:

Cash summary
Money in/out
Upcoming payments
Overdue UDHARI
Trends

No unnecessary graphs.

8. Payments Module

Purpose:

Money history.

Main list:

Date

Party

Amount

Method

Direction

Status

Actions:

Record payment
View invoice
Send receipt

Filters:

Received
Paid
Pending
Method
9. Invoice Module

Purpose:

Bills and collection status.

List:

Invoice Number

Party

Date

Amount

Status

Status:

Paid
Partial
UDHARI
Overdue

Details page:

Invoice PDF
Payment history
Timeline
Share options
10. POS Module

Purpose:

Fastest possible billing.

The rule:

A merchant should create an invoice in under 30 seconds.

Layout:

Left

Product search.

Categories.

Product list.

Right

Current bill.

Shows:

Products
Quantity
Price
Tax
Total

Bottom:

Generate & Send
Generate & Send Flow

Never directly send.

Open confirmation sheet.

Show:

Invoice Preview

Customer:

Ramesh Traders
+91 XXXXXXX

Payment Type:

○ Cash
○ UPI
○ Card
○ UDHARI

For UDHARI:

Require customer phone.

Show:

Customer WhatsApp Number

Reason:

Recovery depends on this number.

Actions:

Generate Invoice

Generate & WhatsApp
11. Parties Module

Purpose:

Digital Khata.

Main list:

Party Name

Phone

UDHARI/Pending Amount

Status

Quick actions:

Call

WhatsApp

View Details

Details:

Financial summary.

Open invoices.

Payment history.

Recovery relationship.

Notes.

12. Products Module

Purpose:

Inventory catalog.

Keep simple.

List:

Product Name

Price

Stock

Category

Actions:

Edit.

Adjust stock.

View history.

Details:

Current stock
Sales history
Purchase history
Stock adjustments
13. Reports Module

Purpose:

Answer business questions.

Not analytics for analysts.

Sections:

Sales
Daily
Weekly
Monthly
Collections
Money received
UDHARI recovered
Outstanding
Products

Best-selling.

Low stock.

Parties

Top customers.

Delayed payers.

Export:

PDF

Excel

14. Settings

Keep as a simple list.

Business
Business details
GST
Address
Invoice
Number format
Logo
Terms
WhatsApp
Connection status
QR pairing
Test message
Payment Methods
UPI
Bank
Razorpay
Team
Users
Roles
Notifications

Preferences.

Subscription

Plan and billing.

Security

Password.

Sessions.

15. Mobile PWA Principles

Mobile first.

Bottom Navigation

Use only 5 items:

Home
POS
Invoices
Payments
More

Inside More:

Cashflow
Parties
Products
Reports
Settings
Touch Rules

Buttons:

Minimum 44px height.

Forms:

One column.

Avoid:

Tables with many columns.

Use:

Cards.
Sheets.
Bottom drawers.
16. Design System
Colors

Primary:

Only one accent color.

Avoid rainbow dashboards.

Cards

Use cards only when grouping information.

Never create cards for every metric.

Typography

Hierarchy:

H1:
Module title.

H2:
Section title.

Body:
Data.

Icons

Use only where recognition improves speed.

Never decorate.

17. BillZo Final Design Test

Before adding any feature ask:

Does the merchant understand it in 5 seconds?
Does it help make or recover money?
Does it reduce a manual task?
Can a small shop owner use it without training?

If the answer is NO,

remove it.

The BillZo Feeling

Stripe gives confidence.

Linear gives speed.

Mercury gives calm.

BillZo should give a merchant the feeling:

"My entire business is under control, and I know exactly what I need to do next."

This document should be treated as the single UI/UX constitution for the entire BillZo PWA.