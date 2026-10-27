import csv
import random

# Set seed for reproducible realistic generation
random.seed(42)

categories = {
    "Dairy & Plant-Based": {
        "unit": "unit",
        "threshold_range": (20, 45),
        "cost_range": (1.80, 5.50),
        "margin_range": (1.30, 1.55),
        "items": [
            ("Whole Milk 1L", "litre"),
            ("Skimmed Milk 1L", "litre"),
            ("2% Reduced Fat Milk 1L", "litre"),
            ("Organic Whole Milk 1L", "litre"),
            ("Organic Soy Milk 1L", "litre"),
            ("Almond Milk Unsweetened 1L", "litre"),
            ("Oat Milk Barista Blend 1L", "litre"),
            ("Coconut Milk Beverage 1L", "litre"),
            ("Greek Yogurt Plain 500g", "tub"),
            ("Greek Yogurt Vanilla 500g", "tub"),
            ("Greek Yogurt Strawberry 150g", "cup"),
            ("Greek Yogurt Blueberry 150g", "cup"),
            ("Skyr Icelandic Yogurt 400g", "tub"),
            ("Kefir Cultured Milk 1L", "bottle"),
            ("Sharp Cheddar Cheese Block 250g", "block"),
            ("Mild Cheddar Slices 200g", "pack"),
            ("Mozzarella Ball Fresh 125g", "pack"),
            ("Shredded Mozzarella 300g", "pack"),
            ("Parmigiano Reggiano Wedge 200g", "wedge"),
            ("Aged Gouda Cheese 200g", "wedge"),
            ("French Brie Wheel 200g", "wheel"),
            ("Camembert Cheese 250g", "box"),
            ("Feta Cheese in Brine 200g", "tub"),
            ("Ricotta Cheese Fresh 250g", "tub"),
            ("Cottage Cheese 400g", "tub"),
            ("Cream Cheese Spread 250g", "tub"),
            ("Salted Butter 250g", "block"),
            ("Unsalted Butter 250g", "block"),
            ("Grass-Fed Cultured Butter 250g", "block"),
            ("Clarified Butter Ghee 350ml", "jar"),
            ("Heavy Whipping Cream 500ml", "carton"),
            ("Sour Cream 300ml", "tub"),
            ("Half & Half Cream 500ml", "carton"),
            ("Coffee Creamer Hazelnut 500ml", "bottle"),
            ("Plant-Based Butter Spread 250g", "tub"),
            ("Vegan Cheddar Shreds 200g", "pack"),
            ("Vegan Mozzarella Block 200g", "block"),
            ("Almond Milk Yogurt 450g", "tub"),
            ("Oat Milk Yogurt Vanilla 450g", "tub"),
            ("Probiotic Drink Yogurt 6x100ml", "pack"),
            ("Swiss Cheese Slices 200g", "pack"),
            ("Provolone Cheese Slices 200g", "pack"),
            ("Havarti Cheese with Herbs 200g", "pack"),
            ("Blue Cheese Wedge 150g", "wedge"),
            ("Goat Cheese Log 150g", "pack"),
            ("Pecorino Romano 200g", "wedge"),
            ("Mascarpone Cream Cheese 250g", "tub"),
            ("Evaporated Milk 370ml", "can"),
            ("Sweetened Condensed Milk 397g", "can"),
            ("Buttermilk Traditional 1L", "carton"),
            ("Organic Ghee 500ml", "jar"),
            ("String Cheese Sticks 12-pack", "pack"),
            ("Babybel Mini Cheeses 6-pack", "net"),
            ("Gorgonzola Crumbles 150g", "tub"),
            ("Organic Goat Milk 1L", "bottle")
        ]
    },
    "Fresh Produce": {
        "unit": "kg",
        "threshold_range": (20, 50),
        "cost_range": (0.80, 4.20),
        "margin_range": (1.35, 1.65),
        "items": [
            ("Honeycrisp Apples", "kg"),
            ("Gala Apples", "kg"),
            ("Fuji Apples", "kg"),
            ("Granny Smith Green Apples", "kg"),
            ("Cavendish Bananas", "bunch"),
            ("Organic Bananas", "bunch"),
            ("Navel Oranges", "kg"),
            ("Valencia Oranges Bag 2kg", "bag"),
            ("Clementine Mandarins 1kg", "bag"),
            ("Fresh Strawberries 400g", "punnet"),
            ("Fresh Blueberries 200g", "punnet"),
            ("Fresh Raspberries 150g", "punnet"),
            ("Fresh Blackberries 150g", "punnet"),
            ("Hass Avocados (Ready to Eat)", "pack"),
            ("Organic Hass Avocados 4-pack", "bag"),
            ("Seedless Lemons 500g", "net"),
            ("Key Limes 500g", "net"),
            ("Vine-Ripened Tomatoes 500g", "pack"),
            ("Cherry Tomatoes Sweet 250g", "punnet"),
            ("Roma Plum Tomatoes", "kg"),
            ("Russet Potatoes Bag 2.5kg", "bag"),
            ("Baby Red Potatoes 1kg", "bag"),
            ("Sweet Sweet Potatoes", "kg"),
            ("Yellow Onions Mesh Bag 1kg", "bag"),
            ("Red Onions", "kg"),
            ("Sweet Vidalia Onions", "kg"),
            ("Fresh Garlic Bulbs 3-pack", "net"),
            ("Organic Carrots 1kg", "bag"),
            ("Baby Carrots Peeled 500g", "bag"),
            ("Broccoli Crowns", "kg"),
            ("Cauliflower Head", "head"),
            ("Baby Spinach Washed 250g", "bag"),
            ("Crisp Romaine Hearts 3-pack", "pack"),
            ("Mixed Salad Greens 200g", "box"),
            ("Arugula Rocket Leaves 150g", "bag"),
            ("Iceberg Lettuce Head", "head"),
            ("English Seedless Cucumbers", "unit"),
            ("Mini Persian Cucumbers 500g", "pack"),
            ("Red Bell Peppers", "kg"),
            ("Yellow Bell Peppers", "kg"),
            ("Green Bell Peppers", "kg"),
            ("Jalapeno Peppers Fresh", "kg"),
            ("White Button Mushrooms 250g", "pack"),
            ("Cremini Brown Mushrooms 250g", "pack"),
            ("Portobello Mushroom Caps 2-pack", "pack"),
            ("Shiitake Mushrooms Fresh 150g", "pack"),
            ("Celery Bunch Crisp", "bunch"),
            ("Fresh Zucchini Green", "kg"),
            ("Yellow Summer Squash", "kg"),
            ("Fresh Asparagus Bunch 400g", "bunch"),
            ("Fresh Green Beans 400g", "bag"),
            ("Fresh Basil Herb Pot", "pot"),
            ("Fresh Cilantro Bunch", "bunch"),
            ("Fresh Flat Parsley Bunch", "bunch"),
            ("Fresh Rosemary Pack 30g", "pack"),
            ("Fresh Thyme Pack 30g", "pack"),
            ("Fresh Ginger Root", "kg"),
            ("Red Radish Bunch", "bunch"),
            ("Green Scallions Spring Onions", "bunch"),
            ("Leeks Fresh 2-pack", "bunch")
        ]
    },
    "Bakery & Breakfast": {
        "unit": "unit",
        "threshold_range": (15, 35),
        "cost_range": (1.20, 4.50),
        "margin_range": (1.30, 1.60),
        "items": [
            ("Artisan Sourdough Boule 600g", "loaf"),
            ("Classic French Baguette 300g", "loaf"),
            ("100% Whole Wheat Sandwich Bread", "loaf"),
            ("White Sandwich Bread Enriched", "loaf"),
            ("Multigrain Seeded Loaf 650g", "loaf"),
            ("Brioche Loaf Sliced 500g", "loaf"),
            ("Rye Bread with Caraway 500g", "loaf"),
            ("Ciabatta Rolls 4-pack", "pack"),
            ("Plain New York Bagels 5-pack", "pack"),
            ("Everything Bagels 5-pack", "pack"),
            ("Cinnamon Raisin Bagels 5-pack", "pack"),
            ("All-Butter Croissants 4-pack", "pack"),
            ("Pain au Chocolat 4-pack", "pack"),
            ("Blueberry Muffins Fresh 4-pack", "box"),
            ("Chocolate Chip Muffins 4-pack", "box"),
            ("Cinnamon Swirl Rolls 4-pack", "box"),
            ("English Muffins Sourdough 6-pack", "pack"),
            ("Pita Bread White 6-pack", "pack"),
            ("Whole Wheat Pita Pockets 6-pack", "pack"),
            ("Flour Tortillas 10-inch 8-pack", "pack"),
            ("Corn Tortillas Street Taco 12-pack", "pack"),
            ("Hamburger Brioche Buns 4-pack", "pack"),
            ("Hot Dog Buns Soft 6-pack", "pack"),
            ("Naan Bread Garlic & Coriander 2-pack", "pack"),
            ("Rolled Whole Oats 1kg", "bag"),
            ("Steel Cut Oats 750g", "canister"),
            ("Quick Cooking Oats 1kg", "bag"),
            ("Honey Nut Toasted Oats Cereal 450g", "box"),
            ("Crispy Rice Cereal 375g", "box"),
            ("Bran Flakes with Raisins 500g", "box"),
            ("Organic Granola with Almonds 400g", "bag"),
            ("Berry Crunchy Muesli 500g", "bag"),
            ("Gluten-Free Oats 750g", "bag"),
            ("Buttermilk Pancake Mix 900g", "box"),
            ("Belgian Waffle Mix 500g", "box"),
            ("Pure Canadian Maple Syrup 250ml", "bottle"),
            ("Natural Blossom Honey 500g", "jar"),
            ("Pancake Syrup Original 750ml", "bottle"),
            ("Almond Butter Creamy 350g", "jar"),
            ("Peanut Butter Smooth 500g", "jar"),
            ("Peanut Butter Crunchy 500g", "jar"),
            ("Hazelnut Cocoa Spread 400g", "jar"),
            ("Strawberry Fruit Jam 370g", "jar"),
            ("Raspberry Seedless Preserve 370g", "jar"),
            ("Orange Seville Marmalade 350g", "jar")
        ]
    },
    "Beverages": {
        "unit": "bottle",
        "threshold_range": (20, 60),
        "cost_range": (0.90, 8.50),
        "margin_range": (1.30, 1.70),
        "items": [
            ("Cold Brew Coffee Bottle 330ml", "bottle"),
            ("Cold Brew Nitro Can 250ml", "can"),
            ("Espresso Roast Coffee Beans 500g", "bag"),
            ("Medium Roast Ground Coffee 340g", "bag"),
            ("Dark Roast Ground Coffee 340g", "bag"),
            ("Single-Origin Colombian Beans 250g", "bag"),
            ("Decaf House Blend Beans 250g", "bag"),
            ("English Breakfast Tea 50 bags", "box"),
            ("Earl Grey Bergamot Tea 50 bags", "box"),
            ("Pure Green Tea Organic 40 bags", "box"),
            ("Peppermint Herbal Infusion 25 bags", "box"),
            ("Chamomile Honey Tea 25 bags", "box"),
            ("Matcha Green Tea Powder 100g", "tin"),
            ("Chai Spice Black Tea 40 bags", "box"),
            ("Orange Juice with Pulp 1L", "carton"),
            ("Smooth Orange Juice No Pulp 1L", "carton"),
            ("Cloudy Apple Juice 1L", "bottle"),
            ("Cranberry Classic Juice 1L", "bottle"),
            ("Ruby Red Grapefruit Juice 1L", "carton"),
            ("Pineapple Coconut Juice 1L", "bottle"),
            ("Sparkling Water Natural 1L", "bottle"),
            ("Sparkling Water Lime 6x330ml", "pack"),
            ("Sparkling Water Lemon 6x330ml", "pack"),
            ("Sparkling Water Wild Berry 6x330ml", "pack"),
            ("Natural Mineral Water Still 1.5L", "bottle"),
            ("Electrolyte Spring Water 750ml", "bottle"),
            ("Cola Classic Soda 6x330ml", "pack"),
            ("Diet Cola Zero Sugar 6x330ml", "pack"),
            ("Ginger Ale Craft Soda 4x330ml", "pack"),
            ("Root Beer Handcrafted 4x330ml", "pack"),
            ("Lemon Lime Fizz 6x330ml", "pack"),
            ("Ginger Kombucha Organic 330ml", "bottle"),
            ("Berry Hibiscus Kombucha 330ml", "bottle"),
            ("Passionfruit Kombucha 330ml", "bottle"),
            ("Coconut Water 100% Pure 1L", "carton"),
            ("Coconut Water with Mango 500ml", "bottle"),
            ("Energy Drink Original 250ml", "can"),
            ("Energy Drink Sugar-Free 250ml", "can"),
            ("Iced Green Tea with Honey 500ml", "bottle"),
            ("Lemon Iced Tea 500ml", "bottle"),
            ("Peach Sparkling Iced Tea 330ml", "can"),
            ("Tonic Water Premium Indian 4x200ml", "pack"),
            ("Club Soda Mixers 6x250ml", "pack"),
            ("Tomato Vegetable Juice 1L", "bottle"),
            ("Aloe Vera Natural Drink 500ml", "bottle"),
            ("Oat Milk Latte Ready-to-Drink 250ml", "can"),
            ("Vanilla Cold Foam Iced Coffee 330ml", "bottle"),
            ("Spiced Apple Cider Warm 1L", "bottle"),
            ("Tart Cherry Sleep Tonic 473ml", "bottle"),
            ("Sparkling Pomegranate Soda 4x330ml", "pack")
        ]
    },
    "Pantry & Dry Goods": {
        "unit": "pack",
        "threshold_range": (20, 50),
        "cost_range": (1.10, 9.80),
        "margin_range": (1.25, 1.55),
        "items": [
            ("Spaghetti Bronze Cut 500g", "pack"),
            ("Penne Rigate Italian 500g", "pack"),
            ("Fusilli Spiral Pasta 500g", "pack"),
            ("Fettuccine Egg Pasta 500g", "pack"),
            ("Rigatoni Semolina Pasta 500g", "pack"),
            ("Gluten-Free Brown Rice Pasta 400g", "pack"),
            ("Marinara Tomato Basil Sauce 680g", "jar"),
            ("Creamy Alfredo Garlic Sauce 420g", "jar"),
            ("Classic Basil Pesto Genovese 190g", "jar"),
            ("Sundried Tomato Pesto 190g", "jar"),
            ("Arrabbiata Spicy Pasta Sauce 680g", "jar"),
            ("Jasmine Fragrant Rice 2kg", "bag"),
            ("Basmati Long Grain Rice 2kg", "bag"),
            ("Short Grain Sushi Rice 1kg", "bag"),
            ("Organic Brown Rice 1kg", "bag"),
            ("Tri-Color Quinoa Organic 500g", "bag"),
            ("Couscous Medium Grain 500g", "box"),
            ("Red Split Lentils 500g", "bag"),
            ("French Green Puy Lentils 500g", "bag"),
            ("Canned Black Beans 400g", "can"),
            ("Canned Chickpeas Garbanzo 400g", "can"),
            ("Canned Red Kidney Beans 400g", "can"),
            ("Canned Cannellini White Beans 400g", "can"),
            ("Canned Diced Plum Tomatoes 400g", "can"),
            ("Canned San Marzano Tomatoes 800g", "can"),
            ("Organic Tomato Paste Tube 150g", "tube"),
            ("Solid White Albacore Tuna in Olive Oil", "can"),
            ("Skipjack Light Tuna in Water 160g", "can"),
            ("Wild Pink Salmon Canned 213g", "can"),
            ("Sardines in Virgin Olive Oil 120g", "can"),
            ("Extra Virgin Olive Oil Cold Pressed 750ml", "bottle"),
            ("Pure Avocado Oil Cooking Spray 200ml", "spray"),
            ("Organic Virgin Coconut Oil 500ml", "jar"),
            ("Expeller Pressed Canola Oil 1L", "bottle"),
            ("Toasted Sesame Oil 250ml", "bottle"),
            ("Modena Balsamic Vinegar Aged 250ml", "bottle"),
            ("Apple Cider Vinegar with Mother 500ml", "bottle"),
            ("Red Wine Vinegar 500ml", "bottle"),
            ("Rice Vinegar Unseasoned 350ml", "bottle"),
            ("All-Purpose Flour Unbleached 2kg", "bag"),
            ("Whole Wheat Bread Flour 1.5kg", "bag"),
            ("Almond Flour Fine Blanched 500g", "bag"),
            ("Granulated White Cane Sugar 1kg", "bag"),
            ("Dark Brown Soft Sugar 500g", "bag"),
            ("Powdered Icing Sugar 500g", "bag"),
            ("Baking Powder Double Acting 200g", "can"),
            ("Baking Soda Pure 500g", "box"),
            ("Pure Bourbon Vanilla Extract 60ml", "bottle"),
            ("Semi-Sweet Chocolate Baking Chips 350g", "pack"),
            ("Sea Salt Coarse Grinder 200g", "grinder"),
            ("Fine Mediterranean Sea Salt 750g", "canister"),
            ("Whole Black Peppercorn Grinder 150g", "grinder"),
            ("Ground Ceylon Cinnamon 60g", "jar"),
            ("Organic Turmeric Powder 70g", "jar"),
            ("Smoked Spanish Paprika 75g", "tin")
        ]
    },
    "Snacks & Confectionery": {
        "unit": "pack",
        "threshold_range": (20, 50),
        "cost_range": (1.10, 6.50),
        "margin_range": (1.30, 1.65),
        "items": [
            ("Kettle Cooked Sea Salt Chips 150g", "bag"),
            ("Smoked BBQ Potato Chips 150g", "bag"),
            ("Sour Cream & Chive Chips 150g", "bag"),
            ("Salt & Malt Vinegar Chips 150g", "bag"),
            ("Jalapeno Cheddar Kettle Chips 150g", "bag"),
            ("Stone Ground Tortilla Chips 250g", "bag"),
            ("Blue Corn Tortilla Chips 220g", "bag"),
            ("Medium Cantina Salsa 450g", "jar"),
            ("Mild Chunky Guacamole 200g", "tub"),
            ("Roasted Salted Almonds 200g", "bag"),
            ("Raw California Walnuts 200g", "bag"),
            ("Roasted Salted Cashews 200g", "bag"),
            ("Deluxe Mixed Nuts No Peanuts 250g", "tub"),
            ("Trail Mix Cranberry Almond 300g", "bag"),
            ("Dry Roasted Peanuts Salted 350g", "jar"),
            ("Dark Chocolate 72% Cacao 100g", "bar"),
            ("Dark Chocolate Sea Salt Caramel 100g", "bar"),
            ("Creamy Swiss Milk Chocolate 100g", "bar"),
            ("Milk Chocolate with Whole Hazelnuts 100g", "bar"),
            ("White Chocolate Vanilla Bean 100g", "bar"),
            ("Organic Gummy Bears Gelatin-Free 150g", "bag"),
            ("Sour Fruit Chews 175g", "bag"),
            ("Classic Licorice Twists 200g", "pack"),
            ("Dark Chocolate Covered Pretzels 150g", "bag"),
            ("Sea Salt Pretzel Twists 300g", "bag"),
            ("Butter Microwave Popcorn 3-pack", "box"),
            ("Cinema Sweet & Salty Popcorn 120g", "bag"),
            ("White Cheddar Popcorn 130g", "bag"),
            ("Chocolate Chip Crunchy Cookies 200g", "pack"),
            ("Double Chocolate Fudge Cookies 200g", "pack"),
            ("Oatmeal Raisin Soft Baked Cookies 220g", "pack"),
            ("Shortbread Butter Rounds 150g", "box"),
            ("Artisan Rosemary Olive Oil Crackers 170g", "box"),
            ("Whole Wheat Table Crackers 200g", "box"),
            ("Water Crackers Classic 125g", "box"),
            ("Brown Rice Sea Salt Cakes 130g", "pack"),
            ("Granola Protein Bars Dark Chocolate 5-pack", "box"),
            ("Chewy Peanut Butter Protein Bars 5-pack", "box"),
            ("Fruit & Nut Energy Bites 120g", "bag"),
            ("Dried Mango Slices Organic 150g", "bag"),
            ("Dried Deglet Noor Dates 250g", "tub"),
            ("Pitted California Prunes 250g", "bag"),
            ("Crispy Seaweed Snacks Toasted 3-pack", "pack"),
            ("Beef Jerky Teriyaki 80g", "bag"),
            ("Beef Jerky Original Smokehouse 80g", "bag")
        ]
    },
    "Meat, Poultry & Seafood": {
        "unit": "pack",
        "threshold_range": (15, 30),
        "cost_range": (3.50, 16.00),
        "margin_range": (1.25, 1.45),
        "items": [
            ("Boneless Skinless Chicken Breasts 800g", "tray"),
            ("Bone-in Chicken Thighs 1kg", "tray"),
            ("Fresh Chicken Drumsticks 900g", "tray"),
            ("Organic Whole Roasting Chicken 1.6kg", "unit"),
            ("Lean Ground Beef 90/10 500g", "tray"),
            ("Regular Ground Beef 80/20 500g", "tray"),
            ("Beef Ribeye Steak Prime Cut 350g", "tray"),
            ("New York Strip Steak 300g", "tray"),
            ("Center Cut Beef Tenderloin Fillet 200g", "tray"),
            ("Beef Stew Meat Diced 500g", "tray"),
            ("Boneless Pork Loin Chops 4-pack", "tray"),
            ("Pork Tenderloin Whole 500g", "pack"),
            ("Thick Cut Applewood Bacon 375g", "pack"),
            ("Smoked Turkey Bacon 340g", "pack"),
            ("Italian Sweet Pork Sausages 5-pack", "tray"),
            ("Spicy Italian Pork Sausages 5-pack", "tray"),
            ("Bratwurst Traditional Links 4-pack", "tray"),
            ("Fresh Atlantic Salmon Fillet 400g", "tray"),
            ("Wild Sockeye Salmon Portions 300g", "tray"),
            ("Atlantic Cod Fillets Fresh 400g", "tray"),
            ("Cooked Black Tiger Shrimp Tail-On 300g", "bag"),
            ("Raw Peeled Deveined Shrimp 400g", "bag"),
            ("Cold Smoked Salmon Slices 150g", "pack"),
            ("Deli Roasted Turkey Breast Slices 200g", "pack"),
            ("Deli Smoked Black Forest Ham 200g", "pack"),
            ("Deli Roast Beef Slices 175g", "pack"),
            ("Genoa Salami Sliced 150g", "pack"),
            ("Prosciutto di Parma 18-month Aged 100g", "pack"),
            ("Beef Meatballs Italian Style 400g", "pack"),
            ("Ground Turkey 93/7 Lean 500g", "tray"),
            ("Lamb Loin Chops Fresh 400g", "tray"),
            ("Fresh Sea Scallops 250g", "tub"),
            ("Cooked Crab Meat Lump 200g", "tub"),
            ("Chicken Breakfast Sausages 10-pack", "pack"),
            ("Spanish Chorizo Dry Cured 200g", "pack")
        ]
    },
    "Frozen Foods": {
        "unit": "box",
        "threshold_range": (15, 35),
        "cost_range": (2.20, 8.50),
        "margin_range": (1.30, 1.55),
        "items": [
            ("Thin Crust Margherita Pizza 380g", "box"),
            ("Stonebaked Pepperoni Pizza 410g", "box"),
            ("Four Cheese Gourmet Pizza 420g", "box"),
            ("Gluten-Free Veggie Pizza 350g", "box"),
            ("Frozen Sweet Garden Peas 750g", "bag"),
            ("Frozen Super Sweet Corn 750g", "bag"),
            ("Frozen Cut Green Beans 750g", "bag"),
            ("Frozen Broccoli Florets 600g", "bag"),
            ("Frozen Mixed Stir Fry Vegetables 750g", "bag"),
            ("Frozen Wild Blueberries 500g", "bag"),
            ("Frozen Triple Berry Medley 500g", "bag"),
            ("Frozen Mango Chunks 500g", "bag"),
            ("Madagascar Vanilla Ice Cream 1L", "tub"),
            ("Belgian Dark Chocolate Gelato 500ml", "tub"),
            ("Salted Caramel Swirl Ice Cream 1L", "tub"),
            ("Strawberries & Cream Ice Cream 1L", "tub"),
            ("Dairy-Free Coconut Vanilla Ice Cream 500ml", "tub"),
            ("Mini Ice Cream Bars Chocolate 6-pack", "box"),
            ("Frozen Pork & Chive Dumplings 500g", "bag"),
            ("Frozen Vegetable Spring Rolls 10-pack", "box"),
            ("Plant-Based Burger Patties 2-pack", "box"),
            ("Crispy Golden French Fries 1kg", "bag"),
            ("Seasoned Waffle Fries 750g", "bag"),
            ("Crispy Potato Hash Browns 10-pack", "box"),
            ("Golden Homestyle Waffles 8-pack", "box"),
            ("Frozen Blueberry Pancakes 8-pack", "box"),
            ("Frozen Breaded Fish Fillets 400g", "box"),
            ("Frozen Cooked Chicken Nuggets 500g", "bag"),
            ("Frozen Cooked Edamame in Pods 400g", "bag"),
            ("Frozen Cheese Pierogies 600g", "bag")
        ]
    },
    "Household & Cleaning": {
        "unit": "unit",
        "threshold_range": (12, 30),
        "cost_range": (2.10, 14.50),
        "margin_range": (1.35, 1.70),
        "items": [
            ("Ultra Dishwashing Liquid Citrus 750ml", "bottle"),
            ("Dishwasher Detergent Pods 36-count", "tub"),
            ("Concentrated Laundry Detergent Liquid 1.5L", "bottle"),
            ("Laundry Detergent Pods 42-count", "tub"),
            ("Fabric Softener Fresh Spring 1.2L", "bottle"),
            ("Multi-Surface Antibacterial Spray 750ml", "spray"),
            ("Bathroom Cleaner Descaler Spray 750ml", "spray"),
            ("Glass & Mirror Shine Cleaner 500ml", "spray"),
            ("Heavy Duty Kitchen Degreaser 500ml", "spray"),
            ("Bleach Disinfectant Original 1.5L", "bottle"),
            ("Paper Towels Ultra Absorbent 6-roll", "pack"),
            ("Toilet Paper 3-Ply Soft 12-roll", "pack"),
            ("Facial Tissues Cube Box 90-sheet", "box"),
            ("Heavy Duty Kitchen Sponges 4-pack", "pack"),
            ("Microfiber Cleaning Cloths 4-pack", "pack"),
            ("Drawstring Tall Trash Bags 30L 30-pack", "box"),
            ("Heavy Duty Outdoor Trash Bags 75L 20-pack", "box"),
            ("Food Storage Sandwich Bags 100-pack", "box"),
            ("Heavy Duty Aluminum Foil 30m", "roll"),
            ("Cling Film Food Wrap 60m", "roll"),
            ("Parchment Non-Stick Baking Paper 20m", "roll"),
            ("Moisturizing Liquid Hand Soap 300ml", "pump"),
            ("Hand Soap Refill Bottle 1L", "bottle"),
            ("Nourishing Daily Shampoo 400ml", "bottle"),
            ("Hydrating Conditioner 400ml", "bottle")
        ]
    }
}

# Category SKU Prefixes
prefixes = {
    "Dairy & Plant-Based": "DAIRY",
    "Fresh Produce": "PROD",
    "Bakery & Breakfast": "BAKE",
    "Beverages": "BEV",
    "Pantry & Dry Goods": "PANTRY",
    "Snacks & Confectionery": "SNK",
    "Meat, Poultry & Seafood": "MEAT",
    "Frozen Foods": "FROZ",
    "Household & Cleaning": "HSE"
}

products = []
sku_counters = {k: 1 for k in prefixes}

# Generate 400 products
# Target distribution:
# ~10% Out of Stock (on_hand = 0)
# ~25% Running Low / Critical (0 < on_hand <= threshold)
# ~65% Healthy Quantity (on_hand > threshold, up to 250)

all_items = []
for cat_name, cat_data in categories.items():
    for item_name, unit_str in cat_data["items"]:
        all_items.append((cat_name, item_name, unit_str, cat_data))

print(f"Total base catalog templates: {len(all_items)}")

# If len(all_items) is not 400, adjust to exactly 400 items
if len(all_items) < 400:
    extra_needed = 400 - len(all_items)
    print(f"Adding {extra_needed} specialty variations to reach exactly 400 items...")
    variations = ["Organic", "Artisan", "Family Pack", "Gourmet", "Select Reserve", "Low Sodium", "Gluten-Free"]
    for i in range(extra_needed):
        cat_name, item_name, unit_str, cat_data = all_items[i % len(all_items)]
        var = variations[i % len(variations)]
        new_name = f"{var} {item_name}"
        all_items.append((cat_name, new_name, unit_str, cat_data))

all_items = all_items[:400]
print(f"Final items count to generate: {len(all_items)}")

# Shuffle items deterministically to disperse categories
random.shuffle(all_items)

rows = []
out_of_stock_target = 40  # 10%
running_low_target = 100  # 25%
healthy_target = 260      # 65%

stock_profile = (
    ["OUT_OF_STOCK"] * out_of_stock_target +
    ["RUNNING_LOW"] * running_low_target +
    ["HEALTHY"] * healthy_target
)
random.shuffle(stock_profile)

for idx, (cat_name, item_name, unit_str, cat_data) in enumerate(all_items):
    prefix = prefixes[cat_name]
    num = sku_counters[cat_name]
    sku_counters[cat_name] += 1
    sku = f"SKU-{prefix}-{num:03d}"
    
    thresh_min, thresh_max = cat_data["threshold_range"]
    threshold = random.randint(thresh_min, thresh_max)
    
    cost_min, cost_max = cat_data["cost_range"]
    cost_price = round(random.uniform(cost_min, cost_max), 2)
    
    margin_min, margin_max = cat_data["margin_range"]
    selling_price = round(cost_price * random.uniform(margin_min, margin_max), 2)
    
    profile = stock_profile[idx]
    if profile == "OUT_OF_STOCK":
        on_hand_qty = 0
    elif profile == "RUNNING_LOW":
        # 1 unit up to threshold
        on_hand_qty = random.randint(1, threshold)
    else:  # HEALTHY
        # threshold + 1 up to threshold * 3 to 5 (or max 220)
        healthy_max = min(250, int(threshold * random.uniform(2.2, 5.0)))
        on_hand_qty = random.randint(threshold + 5, max(threshold + 10, healthy_max))
        
    rows.append({
        "sku": sku,
        "product_name": item_name,
        "category": cat_name,
        "unit": unit_str,
        "cost_price": f"{cost_price:.2f}",
        "selling_price": f"{selling_price:.2f}",
        "on_hand_qty": on_hand_qty,
        "reorder_threshold": threshold
    })

# Output file path
output_file = r"d:\Demand forecasting\grocery_store_stock_400.csv"
public_output = r"d:\Demand forecasting\frontend\public\grocery_store_stock_400.csv"

fieldnames = ["sku", "product_name", "category", "unit", "cost_price", "selling_price", "on_hand_qty", "reorder_threshold"]

with open(output_file, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

import os
os.makedirs(r"d:\Demand forecasting\frontend\public", exist_ok=True)
with open(public_output, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

# Print distribution stats
zero_count = sum(1 for r in rows if r["on_hand_qty"] == 0)
low_count = sum(1 for r in rows if 0 < r["on_hand_qty"] <= r["reorder_threshold"])
healthy_count = sum(1 for r in rows if r["on_hand_qty"] > r["reorder_threshold"])
total_units = sum(r["on_hand_qty"] for r in rows)

print("\n--- Grocery Store 400 Stock CSV Generated Successfully ---")
print(f"File created: {output_file}")
print(f"Public link: {public_output}")
print(f"Total Products: {len(rows)}")
print(f"[Out of Stock]: {zero_count} ({zero_count/len(rows)*100:.1f}%)")
print(f"[Running Low]: {low_count} ({low_count/len(rows)*100:.1f}%)")
print(f"[Healthy Quantity]: {healthy_count} ({healthy_count/len(rows)*100:.1f}%)")
print(f"[Total Physical Units]: {total_units:,}")
