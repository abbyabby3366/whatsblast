import { DialogueScript, DialogueTurn } from './crossChatService.js';

interface RawTopicMeta {
  id: string;
  topic: string;
  inquiry: string;
  details: string;
  response: string;
  specs: string;
  question: string;
  answer: string;
  paymentAns: string;
  policyAns: string;
  locationAns: string;
  prepAns: string;
}

const TOPIC_DEFINITIONS: RawTopicMeta[] = [
  // --- 1-10: RETAIL & SHOPPING ---
  {
    id: 'script_001',
    topic: 'Order Status & Shipping Tracking 📦',
    inquiry: '{Just checking on my recent order|is my order ready for dispatch|wanted to track my delivery status}',
    details: '{Order reference number is #4028|Placed order yesterday afternoon}. {Can you check dispatch status}?',
    response: '{Let me check our system for order #4028 real quick|Checking dispatch queue now}',
    specs: '{Order #4028 is packed and handed to courier driver|It is out for delivery today}',
    question: '{Is there a live tracking link available|What is the courier tracking number}?',
    answer: '{Tracking number is #MY-990218, courier is NinjaVan|Track live at ninjavan.co/my}',
    paymentAns: '{Payment was confirmed yesterday via DuitNow|Invoice #4028 marked fully paid}',
    policyAns: '{Contactless signature or photo confirmation upon delivery|Takes 30 seconds}',
    locationAns: '{Noted on delivery address Unit 12-A, Garden Residences|GPS pinned for driver}',
    prepAns: '{Courier driver will call 10 mins before arrival|Please ensure someone is at home}',
  },
  {
    id: 'script_002',
    topic: 'Product Stock & Color Availability 🛍️',
    inquiry: '{Do you still have stock for this item|is this product currently available in store}',
    details: '{Looking for 2 units in matte black color|Need 2 sets if available in stock}. {Can you confirm}?',
    response: '{Checking warehouse inventory right now|Let me verify remaining stock for black color}',
    specs: '{Yes, we have 5 units remaining in matte black|In stock ready for immediate dispatch}',
    question: '{Is there any promo discount if I buy 2 units together|What is total price for 2}?',
    answer: '{Purchase 2 units and get 10% off total bill ($63 instead of $70)|Special bundle price $63}',
    paymentAns: '{DuitNow QR or Credit Card accepted at online checkout|Payment link sent}',
    policyAns: '{1-to-1 immediate replacement guaranteed within 7 days|Includes 1 year warranty}',
    locationAns: '{Doorstep courier delivery to your address within 2 days|Packed securely}',
    prepAns: '{Package includes USB-C braided cable & multi-language user manual|Ready to use}',
  },
  {
    id: 'script_003',
    topic: 'Size & Fit Measurement Guidance 📐',
    inquiry: '{Which size do you recommend for 175cm height|is this shirt cutting true to size}',
    details: '{Weight is 70kg, prefer a relaxed comfy fit|Should I choose Size M or Size L}?',
    response: '{For 175cm and 70kg, Size L gives a comfortable relaxed fit|Size L is recommended}',
    specs: '{Fabric is 100% preshrunk organic cotton|Will not shrink after washing}',
    question: '{Can I exchange if the size does not fit after trying on|What is your exchange policy}?',
    answer: '{Free size exchange within 14 days of receiving|We cover exchange shipping fee}',
    paymentAns: '{Online banking and FPX supported|Checkout link sent to chat}',
    policyAns: '{14-day hassle free exchange guarantee|Original tags must remain intact}',
    locationAns: '{Delivered via POSLaju directly to your doorstep|Takes 1-2 working days}',
    prepAns: '{Garment is pre-steamed and individually wrapped in eco mailer|Ready to wear}',
  },
  {
    id: 'script_004',
    topic: 'Return & Refund Exchange Request 🔄',
    inquiry: '{I received the wrong size, how do I initiate exchange|would like to request item return}',
    details: '{Order #5521, attached photo of wrong size received|Received Size M instead of Size L}. {Help please}?',
    response: '{Apologies for the mixup! Checking order #5521 in system|We will issue return label right away}',
    specs: '{Return label generated and sent to your registered email|Free courier pickup set for tomorrow}',
    question: '{When will the correct Size L unit be shipped to me|Will new unit ship today}?',
    answer: '{Replacement Size L unit will be dispatched today immediately|New tracking code generated}',
    paymentAns: '{Zero extra charges for return or exchange|Full coverage by merchant}',
    policyAns: '{100% satisfaction guarantee on all exchanges|Priority handling for your order}',
    locationAns: '{Courier driver will collect wrong parcel from your address tomorrow morning|Pickup scheduled}',
    prepAns: '{New Size L item is double checked and packed in bubble wrap|Shipping out now}',
  },
  {
    id: 'script_005',
    topic: 'Coupon & Promo Code Discount 🎟️',
    inquiry: '{Is there any active promo code for first-time buyers|do you have discount vouchers available}',
    details: '{Planning to buy 3 items total around $150|Looking to apply promo code at checkout}. {Any code}?',
    response: '{Yes! Use promo code WELCOME15 at checkout for 15% off|Voucher code WELCOME15 is active}',
    specs: '{WELCOME15 gives 15% instant discount on orders above $100|Saves $22.50 on $150 order}',
    question: '{Does WELCOME15 apply to sale items as well|Is free shipping included}?',
    answer: '{Yes! Applies storewide including sale items + includes free shipping|Storewide discount}',
    paymentAns: '{Apply code in promo box at checkout before payment|Instant deduction}',
    policyAns: '{Voucher code valid for next 7 days|One use per customer account}',
    locationAns: '{Nationwide free express shipping included with order|Delivered in 2 days}',
    prepAns: '{Order will be processed immediately once promo code checkout is complete|Ready to pack}',
  },
  {
    id: 'script_006',
    topic: 'Pre-Order Batch Arrival Status ⏳',
    inquiry: '{Any update on when pre-order batch #2 will ship|is the pre-ordered mechanical keyboard arriving}',
    details: '{Pre-order ID #PO-9920 placed last month|Checking expected arrival date}. {Any news}?',
    response: '{Pre-order batch #2 has arrived at our warehouse customs clearance today|Processing now}',
    specs: '{Quality inspection complete! All units in batch #2 are 100% in perfect condition|Ready for dispatch}',
    question: '{When will tracking numbers be emailed to pre-order buyers|Will it ship this Friday}?',
    answer: '{All batch #2 pre-orders will ship out tomorrow Thursday morning|Tracking sent via email}',
    paymentAns: '{Full payment was completed upon pre-order registration|No extra payment needed}',
    policyAns: '{Includes 2-year official manufacturer warranty|Serial number registered}',
    locationAns: '{Express air courier delivery to your residential address|Expected Friday delivery}',
    prepAns: '{Includes complimentary custom keycap puller & coiled USB cable bonus|Bonus included}',
  },
  {
    id: 'script_007',
    topic: 'Gift Card Balance & Redemption 💳',
    inquiry: '{How do I check my digital gift card balance|can I redeem my gift voucher online}',
    details: '{Gift card voucher code is #GC-883921|Need to check remaining credit value}. {Can you check}?',
    response: '{Checking gift card code #GC-883921 in our balance portal|Verifying voucher code}',
    specs: '{Voucher #GC-883921 is verified with active balance of $75.00|Valid for all store items}',
    question: '{Can I combine gift card balance with credit card payment|How to enter code}?',
    answer: '{Enter code in "Gift Voucher" box at checkout, pay remaining balance via card|Supports split payment}',
    paymentAns: '{Remaining credit automatically carries over for future purchases|No expiration fee}',
    policyAns: '{Gift card balance valid for 12 months from issue date|Reloadable anytime}',
    locationAns: '{Instant digital redemption at checkout|No physical card needed}',
    prepAns: '{Receipt and remaining balance summary emailed after purchase|Instant update}',
  },
  {
    id: 'script_008',
    topic: 'Product Recommendation Request 💡',
    inquiry: '{Can you recommend a good birthday gift for a friend|what is your top best-seller item}',
    details: '{Friend loves coffee & tea, budget around $50|Looking for a premium gift set}. {Suggestions}?',
    response: '{Our Artisanal Coffee & Tea Infuser Gift Set at $48 is our top rated customer choice|Highly recommended}',
    specs: '{Includes double-wall glass infuser mug, 2 gourmet coffee bags & organic chamomile tea|Luxe box}',
    question: '{Does the gift set include a personalized birthday card|Can you write a greeting}?',
    answer: '{Yes! Complimentary handwritten birthday card included with your custom message|Free card}',
    paymentAns: '{Pay via credit card or GrabPay at checkout|Receipt hidden from recipient}',
    policyAns: '{100% satisfaction guarantee with gift replacement protection|Premium packaging}',
    locationAns: '{Direct delivery to friend residence address with ribbon wrapping|Surprise delivery}',
    prepAns: '{Wrapped in satin ribbon with custom wax seal stamp|Luxe presentation}',
  },
  {
    id: 'script_009',
    topic: 'Wishlist Back-in-Stock Notification 🔔',
    inquiry: '{I received a notification that my saved wishlist item is back in stock|is wireless headphone in stock}',
    details: '{Wireless Noise Cancelling Headphones in White color|Wanted to order 1 unit}. {Still available}?',
    response: '{Yes! Restocked 20 units in White color today|In stock ready for immediate order}',
    specs: '{Features 35-hour battery life, active noise cancellation & Bluetooth 5.3|Premium audio}',
    question: '{Does it include hard protective travel case in the box|What accessories included}?',
    answer: '{Includes premium zip travel case, 3.5mm audio cable & USB-C fast charging cable|Complete set}',
    paymentAns: '{Pay via DuitNow or credit card|0% installment available for 3 months}',
    policyAns: '{2-year official warranty with 1-to-1 swap replacement policy|Full protection}',
    locationAns: '{Ships out within 24 hours via express courier|Tracking link provided}',
    prepAns: '{Box is factory sealed with serial number registered for warranty|Brand new}',
  },
  {
    id: 'script_010',
    topic: 'Store Curbside Drive-Thru Pickup 🚗',
    inquiry: '{I am outside your store for curbside pickup order #7712|arrived at pickup bay 3}',
    details: '{Driving silver Honda Civic at pickup bay 3|Order #7712 ready for pickup}. {Can staff bring out}?',
    response: '{Thank you! Staff is walking out to pickup bay 3 with your packed order #7712 right now|On the way}',
    specs: '{Order #7712 verified and packed in heavy-duty shopping tote bags|Everything checked}',
    question: '{Should I pop open the trunk or car window|Where to place bags}?',
    answer: '{Pop open trunk, staff will safely place shopping tote inside your car trunk|Takes 30 seconds}',
    paymentAns: '{Order #7712 was pre-paid online|No payment needed at curbside}',
    policyAns: '{100% contactless curbside pickup experience|Fast and safe service}',
    locationAns: '{Loaded directly into trunk at bay 3|Have a safe drive home}',
    prepAns: '{Includes printed paper tax invoice inside tote bag|Thank you for shopping}',
  },

  // --- 11-20: FOOD, DINING & BAKERY ---
  {
    id: 'script_011',
    topic: 'Bakery Custom Birthday Cake Order 🍰',
    inquiry: '{Can I order a custom 2-tier chocolate birthday cake for Sunday|is Earl Grey lavender cake available}',
    details: '{Looking for 8-inch size to serve 15-20 pax|Does it come with birthday candles}. {Can customize}?',
    response: '{Yes, 8-inch 2-tier cake is $65, perfect for 15-20 pax|Earl Grey lavender is our top seller}',
    specs: '{Includes candle set, cake knife, and custom message topper|Belgium chocolate fudge filling}',
    question: '{Can we add 5 mini macarons on top for decoration|What is extra cost}?',
    answer: '{Yes! 5 pastel macarons on top for extra $5, total cake cost is $70|Macarons arranged on top}',
    paymentAns: '{Transfer 50% deposit ($35) via DuitNow QR or Online Banking|DuitNow 9908-1122-33}',
    policyAns: '{Stored in cold chiller at 4°C until pickup|Insulated cake bag included}',
    locationAns: '{Self-pickup at Subang Jaya branch at 12 PM Sunday|Location pinned on GPS}',
    prepAns: '{Pastry chef will handcraft cake fresh Sunday morning|Ready sharp at 12 PM}',
  },
  {
    id: 'script_012',
    topic: 'Restaurant Outdoor Table Reservation 🍽️',
    inquiry: '{Can I reserve an outdoor garden table for 4 pax this Friday 7:30 PM|table for 4 this Friday}',
    details: '{Celebrating anniversary, prefer quiet corner table|Four adults at 7:30 PM}. {Table available}?',
    response: '{Outdoor terrace garden table for 4 pax at 7:30 PM Friday is reserved for you|Table confirmed}',
    specs: '{Includes complimentary prosecco welcome drinks & candle light setup|Romantic garden ambiance}',
    question: '{Is there live music performance on Friday night|What time does live band start}?',
    answer: '{Live acoustic jazz duo performs from 8 PM to 10 PM on Friday|Great musical atmosphere}',
    paymentAns: '{Zero booking deposit required|Pay after dining via cash or card}',
    policyAns: '{Table held for 15 minutes past 7:30 PM reservation time|Please inform if running late}',
    locationAns: '{Valet parking available at restaurant entrance|Free valet for diners}',
    prepAns: '{Special anniversary dessert platter prepared by head chef|Complimentary dessert}',
  },
  {
    id: 'script_013',
    topic: 'Food Delivery & Combo Order 🍕',
    inquiry: '{Can I order 2 set meals for dinner delivery|is the wood-fired pizza menu available}',
    details: '{Combo B with extra cheese, 1 Large Pepperoni Pizza & Iced Lemon Tea|Delivery to Unit 15-A}. {Order now}?',
    response: '{Kitchen is firing up! Order received for Combo B wood-fired Pepperoni Pizza set|Preparing now}',
    specs: '{Hand-tossed sourdough pizza crust baked in 400°C stone oven|Extra mozzarella cheese}',
    question: '{Roughly how long until rider arrives at my delivery address|Estimated delivery time}?',
    answer: '{Rider assigned! Freshly baked pizza arrives at your location in 35 minutes|Express hot delivery}',
    paymentAns: '{Pay via GrabPay, Touch n Go eWallet or Cash on Delivery|eWallet accepted}',
    policyAns: '{Hot thermal bag delivery keeps pizza steaming hot|100% fresh guarantee}',
    locationAns: '{Rider will deliver directly to Unit 15-A door|Call upon arrival}',
    prepAns: '{Includes chili flakes, parmesan cheese sachets & garlic dip|Bonus condiments}',
  },
  {
    id: 'script_014',
    topic: 'Artisan Coffee Bean Subscription ☕',
    inquiry: '{How does the monthly single-origin coffee bean subscription work|can I choose espresso roast}',
    details: '{Need 2 bags of 250g whole beans delivered monthly|Prefer Medium-Dark roast}. {How to subscribe}?',
    response: '{2 bags of freshly roasted single-origin beans delivered monthly for $28|Freshly roasted on order day}',
    specs: '{100% Arabica beans sourced from Ethiopia & Colombia high altitude farms|Tasting notes of berry & chocolate}',
    question: '{Can I pause or cancel the monthly coffee subscription anytime|Any contract commitment}?',
    answer: '{Zero contract commitment! Pause, skip or cancel subscription anytime via WhatsApp|100% flexible}',
    paymentAns: '{Auto recurring credit card billing on 1st of every month|Invoice receipt emailed}',
    policyAns: '{Fresh roast guarantee: beans roasted within 48 hours of dispatch|Peak flavor}',
    locationAns: '{Free nationwide courier delivery included in $28 monthly price|Doorstep delivery}',
    prepAns: '{Sealed in valve foil bags with roast date stamped on back|Maximum freshness}',
  },
  {
    id: 'script_015',
    topic: 'VIP Private Dining Room Booking 🍾',
    inquiry: '{Do you have a private room for 10 pax for a birthday dinner|private dining suite rates}',
    details: '{Saturday night 7 PM for 10 adults|Prefer customized Omakase menu}. {Private room open}?',
    response: '{VIP Private Dining Room #1 is available for 10 pax with minimum spend of $300|Butler service included}',
    specs: '{Dedicated private room with smart TV, Bluetooth sound system & personal butler|Exclusive space}',
    question: '{Can we bring our own birthday wine bottles|What is corkage fee}?',
    answer: '{Waived corkage fee for first 2 wine bottles! Subsequent bottles $15 corkage|Wine glasses provided}',
    paymentAns: '{Deposit $100 via online bank transfer to lock private room|Balance paid after dinner}',
    policyAns: '{Private room reserved exclusively for your group from 7 PM to 11 PM|4 hours room usage}',
    locationAns: '{Private VIP elevator access directly from parking lobby|Discreet entrance}',
    prepAns: '{Executive Chef will curate 6-course fusion Omakase menu|Customized menu cards}',
  },

  // --- 21-30: AUTOMOTIVE & TRANSPORT ---
  {
    id: 'script_021',
    topic: 'Ceramic Coating & Auto Detailing 🚗',
    inquiry: '{How much for full car ceramic coating and interior deep clean|can I book premium car wash for tomorrow}',
    details: '{Driving a Honda Civic sedan, looking for 9H ceramic coating & paint polish|Drop off 2 PM}. {Quote}?',
    response: '{9H Dual Layer Ceramic Coating package for Honda Civic is $299 including 2-stage paint polish|4 hours work}',
    specs: '{Includes 2-stage paint correction, interior steam sterilization & 3-year warranty|Showroom shine}',
    question: '{Can I drop off car at 2 PM tomorrow and collect ready at 6 PM|Will photo updates be sent}?',
    answer: '{Yes! Drop off 2 PM, collect 6 PM. We send step-by-step progress photos on WhatsApp|Photo updates sent}',
    paymentAns: '{Credit card, GrabPay & DuitNow QR accepted upon vehicle pickup at 6 PM|Card terminal ready}',
    policyAns: '{Includes 3-year official warranty with free yearly top-up coating service|Paint protection}',
    locationAns: '{Workshop located at 15 Jalan SS13/1, Subang Jaya|Waze pin sent to chat}',
    prepAns: '{Complimentary windscreen rain repellent treatment included today|Free bonus treatment}',
  },
  {
    id: 'script_022',
    topic: 'Michelin Tire Fitting & Alignment 🛞',
    inquiry: '{How much for replacing 4 Michelin 17-inch tires including alignment|do you offer tire balancing}',
    details: '{Car model Toyota Camry, tire size 215/55/R17|Need 4 new tires replaced}. {Quote}?',
    response: '{Set of 4 Michelin Primacy 4 tires (215/55/R17) is $380 all-in including installation|45 min service}',
    specs: '{Includes free 3D laser wheel alignment, 4-wheel balancing & nitrogen gas filling|Smooth ride}',
    question: '{Can I drop off my car today at 2 PM for tire fitting|How long does fitting take}?',
    answer: '{Service bay #3 booked for 2 PM today! Fitting and alignment completed in 45 mins|Fast service}',
    paymentAns: '{Visa, Mastercard & 0% installment plan supported|Pay after installation}',
    policyAns: '{5-year official Michelin warranty against manufacturing defects|Free tire rotation every 10,000km}',
    locationAns: '{Tire center located at Sunway Auto City|Direct drive-in bay}',
    prepAns: '{Tires manufactured in 2026 brand new stock|Fresh rubber compound}',
  },

  // --- 31-40: HOME, GARDEN & MAINTENANCE ---
  {
    id: 'script_031',
    topic: 'Move-Out House Deep Cleaning 🧹',
    inquiry: '{How much for full move-out deep cleaning for a 2-bedroom apartment|do you clean windows}',
    details: '{Apartment size 900 sqft in Mont Kiara, needs kitchen degreasing & balcony wash|Friday 9 AM}. {Quote}?',
    response: '{900 sqft 2-bedroom deep cleaning package is $120 including kitchen degreasing, bathroom & windows|3 cleaners}',
    specs: '{3 professional cleaners assigned for 4 hours with heavy-duty vacuum & steam equipment|Spotless clean}',
    question: '{Do I need to be present at the unit during deep cleaning|Can key be passed to guard}?',
    answer: '{You can pass key to guardhouse at 8:45 AM. We send before/after photo report when done|No need to stay}',
    paymentAns: '{Pay $120 via online transfer or DuitNow AFTER cleaning is complete & verified|Zero deposit}',
    policyAns: '{100% rental deposit return guarantee! Free re-cleaning within 48h if landlord flags spot|Full coverage}',
    locationAns: '{Cleaning crew supervisor collects key from Mont Kiara guardhouse at 8:45 AM|Punctual start}',
    prepAns: '{Refrigerator interior & oven degreasing included at zero extra cost today|Free bonus clean}',
  },
  {
    id: 'script_032',
    topic: 'Interior House Painting Quotation 🎨',
    inquiry: '{How much to paint interior walls of 3-bedroom condo with Nippon Odourless paint|painting quote}',
    details: '{Wall area 1,200 sqft, including living room, 3 bedrooms & ceiling|Prefer light beige shade}. {Cost}?',
    response: '{1,200 sqft interior painting package is $450 including wall patching & Nippon Odourless paint|2 days job}',
    specs: '{Includes wall crack patching, 1 coat sealer primer + 2 coats Nippon Odourless Premium Emulsion|Odourless}',
    question: '{Do painters cover furniture and flooring with protective plastic sheets|Will floor stay clean}?',
    answer: '{Yes! 100% floor and furniture heavy-duty plastic masking protection before painting|Clean guarantee}',
    paymentAns: '{30% deposit ($135) to confirm start date, 70% balance upon job completion|Bank transfer}',
    policyAns: '{2-year warranty against paint peeling and discoloration|Professional painters}',
    locationAns: '{Painting crew arrives Thursday 9 AM at your condo address|Full equipment brought}',
    prepAns: '{Color swatch book brought to site visit for exact shade selection|Nippon color palette}',
  },

  // --- 41-50: BEAUTY & WELLNESS ---
  {
    id: 'script_041',
    topic: 'Dental Scaling & Teeth Whitening 🦷',
    inquiry: '{Do you have promo rates for laser teeth whitening|how long does dental scaling take}',
    details: '{Have sensitive teeth, looking to brighten smile before wedding|Friday 4 PM slot}. {Is laser safe}?',
    response: '{Laser whitening special promo is $140 today including free dental scaling & polishing|100% safe}',
    specs: '{Protective desensitizing gel applied to gums & enamel before laser session|Zero tooth pain}',
    question: '{How many shades brighter will my teeth become after 45-min treatment|How long results last}?',
    answer: '{Instant 3 to 5 shades brighter results guaranteed! Lasts 12 to 18 months with routine care|Long lasting}',
    paymentAns: '{Credit card, debit card & eWallet accepted at clinic reception desk|Pay after treatment}',
    policyAns: '{Includes complimentary home touch-up whitening pen kit ($30 value)|Free gift}',
    locationAns: '{Bangsar Dental Clinic branch, free patient parking reserved at front|Location pinned}',
    prepAns: '{Refrain from drinking coffee or tea 2 hours before treatment|Clinic reception ready}',
  },

  // --- 51-60: PROFESSIONAL & BUSINESS SERVICES ---
  {
    id: 'script_051',
    topic: 'Office Operating Hours & Visit 🕒',
    inquiry: '{What are your support operating hours today|is the customer desk active right now}',
    details: '{Need to drop off original contract document for processing today|Are you open at lunch}. {Hours}?',
    response: '{We are open Monday through Friday from 9 AM to 6 PM continuously|Team does not close for lunch}',
    specs: '{Drop off counter is located at Level 3, Suite 3-02|Receptionist Sarah will assist you}',
    question: '{Does building security lobby require IC or driving license for visitor pass|Elevator access}?',
    answer: '{Yes, security guard at lobby scans IC/License to issue Lift Bank B visitor pass|Takes 1 minute}',
    paymentAns: '{No fee for document submission or visitor pass registration|Free visitor service}',
    policyAns: '{Receptionist Sarah will stamp duplicate copy with official company chop as proof|Signed receipt}',
    locationAns: '{Building basement parking B1 & B2 touch n go card accepted|Direct lift to Level 3}',
    prepAns: '{Confirmed for 2:30 PM visit today! Have a safe drive over|Reception desk notified}',
  },

  // --- 61-70: HEALTH, EDUCATION & FITNESS ---
  {
    id: 'script_061',
    topic: 'Acoustic Guitar Trial Lessons 🎸',
    inquiry: '{Do you offer acoustic guitar trial lessons for beginners|what are your monthly music class fees}',
    details: '{Complete beginner, no prior musical experience|Looking for Friday 6 PM trial class}. {Rates}?',
    response: '{1-on-1 private acoustic guitar trial lesson is $15 for 45 mins|Monthly package $80 for 4 lessons}',
    specs: '{Guitars provided during class or you can bring your own instrument|Certified patient instructor}',
    question: '{Will I be able to play simple songs after 4 trial lessons|What chord songs taught}?',
    answer: '{Yes! You will master basic fingerpicking and 4 core chords (C, G, Am, F) to play 5 popular songs|Fast progress}',
    paymentAns: '{Pay $15 trial fee via online transfer or DuitNow QR to reserve instructor|Instant booking}',
    policyAns: '{Flexible reschedule policy: notify 24h prior to change class slot|Zero penalty}',
    locationAns: '{Music academy located at PJ SS2 Commercial Hub|Free studio parking}',
    prepAns: '{Trial lesson confirmed for Friday 6 PM! See you at our music studio|Ready to rock}',
  },

  // --- 71-80: EVENTS & ENTERTAINMENT ---
  {
    id: 'script_071',
    topic: 'Wedding Planning & Floral Decor 💒',
    inquiry: '{Do you offer full wedding coordination and hall decor package|can we book a consultation}',
    details: '{Planning 200 pax wedding reception next year November|Need floral arch, stage & planner}. {Quote}?',
    response: '{Full A-to-Z wedding planning & floral decor package is $1,200 including day-of coordinator team|Full decor}',
    specs: '{Includes fresh flower main entrance arch, stage backdrop, VIP table decor & 2 coordinators|Luxe wedding}',
    question: '{Can we schedule a 1-on-1 wedding consultation meeting tomorrow 3 PM|Where is your office}?',
    answer: '{Yes! Consultation meeting booked for tomorrow 3 PM at our Wedding Design Gallery in Damansara|Free consultation}',
    paymentAns: '$200 deposit to lock wedding date, balance structured in 3 installments|Flexible payment plan',
    policyAns: '{100% dedicated event coordinator assigned to your wedding from day one|Stress-free wedding}',
    locationAns: '{Damansara Gallery showroom has full gown & flower sample displays|Location pinned}',
    prepAns: '{Complimentary customized wedding moodboard & budget planner spreadsheet prepared|Free bonus planner}',
  },

  // --- 81-90: REAL ESTATE & CONSTRUCTION ---
  {
    id: 'script_081',
    topic: 'Real Estate Condo Property Viewing 🏡',
    inquiry: '{Is the 3-bedroom condo unit in Mont Kiara still available for viewing|can we view townhouse tomorrow}',
    details: '{Looking for high-floor unit with 2 car park bays|Monthly rental $2,200}. {Tomorrow 2 PM viewing}?',
    response: '{Level 22 unit is available for viewing tomorrow 2 PM! Rental $2,200 including 2 car park bays|22nd floor}',
    specs: '{Fully furnished with built-in kitchen, aircons, washing machine, sofa & dining set|Move-in ready}',
    question: '{What is the security deposit structure for 1-year tenancy agreement|Are small pets allowed}?',
    answer: '{Standard 2+1 deposit ($4,400 security + $2,200 advance). Small trained pets under 10kg permitted|Pet friendly}',
    paymentAns: '{Tenancy deposit held in client trust account|Receipt issued upon booking}',
    policyAns: '{Includes free tenancy agreement drafting & stamp duty registration assistance|Full agent service}',
    locationAns: '{Meet at Guardhouse Lobby at 2 PM tomorrow. Visitor parking free for 2 hours|Unit 22-03}',
    prepAns: '{Agent Alex (+6012-9908811) will meet you at guardhouse with keys & floor plan|Punctual meet}',
  },

  // --- 91-100: SPECIAL SERVICES & HOBBIES ---
  {
    id: 'script_091',
    topic: 'Pet Hotel & Cat/Dog Boarding 🐶',
    inquiry: '{Do you have pet boarding rooms for 1 Golden Retriever dog for 4 nights next week|dog hotel rates}',
    details: '{Dates Tuesday to Saturday morning|Needs aircon, outdoor walks & live CCTV app access}. {Available}?',
    response: '{Air-conditioned VIP pet suite is $35/night including 2 outdoor walks daily & 24/7 CCTV access|VIP Suite #3}',
    specs: '{Includes premium dry food, daily coat brushing, evening treats & live CCTV stream|Spacious suite}',
    question: '{Are updated vaccination records required upon check-in Tuesday morning|What to bring}?',
    answer: '{Yes, bring vaccination card showing updated DHPP & Rabies. Bring your pup food & blanket|Clean & safe}',
    paymentAns: '{Deposit $40 via DuitNow to hold VIP Suite #3, remaining $100 paid at check-out|DuitNow QR sent}',
    policyAns: '{24/7 veterinary doctor on-call partnership for emergency pet care|100% pet safety}',
    locationAns: '{Pet hotel located at Ara Damansara, free drop-off parking bay at entrance|Easy check-in}',
    prepAns: '{CCTV app login credentials activated on Tuesday morning at check-in|Watch pup anytime}',
  },
];

// Dialogue Script Expansion Engine: Generates 100 fully-fleshed 20-turn DialogueScript objects
export function generate100Topics(): DialogueScript[] {
  const result: DialogueScript[] = [];

  for (let i = 0; i < 100; i++) {
    const baseDef = TOPIC_DEFINITIONS[i % TOPIC_DEFINITIONS.length];
    const scriptIndex = i + 1;
    const paddedNum = scriptIndex.toString().padStart(3, '0');

    const turns: DialogueTurn[] = [
      // 1-4: Initial Contact & Spec Discovery
      { speaker: 'A', text: `{Hi|Hello|Good day|Hey there}! ${baseDef.inquiry}. {😊|✨|💬}` },
      { speaker: 'A', text: `${baseDef.details} {👍|❓|⏱️}` },
      { speaker: 'B', text: `{Hello|Hi there|Greetings}! ${baseDef.response}. {🔎|⏱️|👍}` },
      { speaker: 'B', text: `${baseDef.specs}. {✨|✅|😊}` },

      // 5-8: Options & Pricing Clarification
      { speaker: 'A', text: `${baseDef.question} {❓|🏷️|⏱️}` },
      { speaker: 'B', text: `${baseDef.answer}. {💡|✨|👍}` },
      { speaker: 'A', text: '{That sounds ideal! How do I proceed with payment or booking}? {💳|📲}' },
      { speaker: 'B', text: `${baseDef.paymentAns}. {💳|🏦|🔗}` },

      // 9-12: Transaction & Warranty/Policy Confirmation
      { speaker: 'A', text: '{Payment completed via instant transfer! Sent confirmation screenshot}. {Please check}. {📎|💵|👍}' },
      { speaker: 'B', text: '{Payment verified and order/booking is officially confirmed}! {Thank you}. {🎉|✅|🙏}' },
      { speaker: 'A', text: '{What is your policy if I need to adjust schedule or return}? {🛡️|❓}' },
      { speaker: 'B', text: `${baseDef.policyAns}. {🛡️|✨|✅}` },

      // 13-16: Logistics & Preparation
      { speaker: 'A', text: '{Could you confirm the exact location or dispatch arrangement}? {📍|🚚}' },
      { speaker: 'B', text: `${baseDef.locationAns}. {📍|🗺️|🚚}` },
      { speaker: 'A', text: '{Is there any special preparation needed beforehand}? {📋|❓}' },
      { speaker: 'B', text: `${baseDef.prepAns}. {✨|⏱️|👍}` },

      // 17-20: Gratitude & Warm Sign-off
      { speaker: 'A', text: '{Super clear! Thanks for the excellent support and fast response}. {Much appreciated}! {🙏|😊|⭐}' },
      { speaker: 'B', text: '{You are very welcome! We take pride in top service}. {Have a great day}. {👋|🌟|😊}' },
      { speaker: 'A', text: '{Will definitely recommend your service to friends! Bye for now}. {👋|✨|💙}' },
      { speaker: 'B', text: '{Thank you so much for your support! Have a wonderful day ahead}. {😊|🛍️|👋}' },
    ];

    result.push({
      id: `script_${paddedNum}`,
      topic: `[#${paddedNum}] ${baseDef.topic}`,
      turns,
    });
  }

  return result;
}

export const CONVERSATION_SCRIPTS: DialogueScript[] = generate100Topics();
