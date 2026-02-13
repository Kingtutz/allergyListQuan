import './style.css'
import { initFirebase, saveRecipesToFirebase, listenToRecipes, saveDishesToFirebase, listenToDishes, saveMasterIngredientsToFirebase, listenToMasterIngredients, saveAllergenKeywordsToFirebase, listenToAllergenKeywords } from './firebase'

// Configure your passwords here
const ADMIN_PASSWORD = 'quan2018'; // Full access - can add/edit/delete
const READONLY_PASSWORD = 'staff123'; // Read-only - can only view

type AccessLevel = 'none' | 'readonly' | 'admin';
type DishCategory = 'lunch' | 'cold' | 'hot' | 'dessert';
type AllergenKeywords = Record<string, string[]>;

const DEFAULT_ALLERGEN_KEYWORDS: AllergenKeywords = {
  lactose: ['lactose', 'milk', 'cream'],
  dairy: ['milk', 'butter', 'cheese'],
  gluten: ['flour', 'panko', 'mjol', 'mjöl', 'bovete'],
  peanuts: ['peanut', 'peanuts'],
  nuts: ['nut', 'nuts', 'almond', 'cashew', 'walnut', 'pecan', 'hazelnut'],
  soy: ['soy', 'soya', 'tofu', 'edamame'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'anchovy'],
  egg: ['egg', 'eggs', 'mayonnaise']
};

interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string;
  allergies?: string[];
}

interface Dish {
  id: string;
  name: string;
  recipeIds: string[];
  ingredients?: string[];
  allergies?: string[];
  category?: DishCategory;
  notes?: string;
}

class RecipeManager {
  private recipes: Recipe[] = [];
  private dishes: Dish[] = [];
  private masterIngredients: string[] = [];
  private allergenKeywords: AllergenKeywords = { ...DEFAULT_ALLERGEN_KEYWORDS };
  private allergyFilters: Set<string> = new Set();
  private useFirebase: boolean = false;
  private isAuthenticated: boolean = false;
  private accessLevel: AccessLevel = 'none';

  constructor() {
    this.loadFromStorage();
    this.checkAuthentication();
    this.setupLoginForm();
    
    // Only initialize app if already authenticated
    if (this.isAuthenticated) {
      this.showApp();
      this.initializeFirebase();
      this.setupEventListeners();
      this.render();
    } else {
      this.showLogin();
    }
  }

  private setupLoginForm(): void {
    const loginForm = document.getElementById('loginForm') as HTMLFormElement;
    loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const passwordInput = document.getElementById('loginPassword') as HTMLInputElement;
      const password = passwordInput.value;
      
      if (password === ADMIN_PASSWORD) {
        this.isAuthenticated = true;
        this.accessLevel = 'admin';
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('accessLevel', 'admin');
        this.showApp();
        this.initializeFirebase();
        this.setupEventListeners();
        this.render();
        passwordInput.value = '';
      } else if (password === READONLY_PASSWORD) {
        this.isAuthenticated = true;
        this.accessLevel = 'readonly';
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('accessLevel', 'readonly');
        this.showApp();
        this.initializeFirebase();
        this.setupEventListeners();
        this.render();
        passwordInput.value = '';
      } else {
        const errorMsg = document.getElementById('loginError');
        if (errorMsg) {
          errorMsg.style.display = 'block';
          setTimeout(() => {
            errorMsg.style.display = 'none';
          }, 3000);
        }
        passwordInput.value = '';
      }
    });
  }

  private showLogin(): void {
    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (app) app.style.display = 'none';
  }

  private showApp(): void {
    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'block';
  }

  private logout(): void {
    this.isAuthenticated = false;
    this.accessLevel = 'none';
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('accessLevel');
    this.showLogin();
  }

  private checkAuthentication(): void {
    // Check if user is authenticated in this session
    const sessionAuth = sessionStorage.getItem('isAuthenticated');
    const sessionAccess = sessionStorage.getItem('accessLevel') as AccessLevel;
    this.isAuthenticated = sessionAuth === 'true';
    this.accessLevel = sessionAccess || 'none';
  }

  private async authenticate(): Promise<boolean> {
    if (this.accessLevel === 'admin') return true;
    if (this.accessLevel === 'readonly') {
      alert('Read-only access. You cannot modify recipes or dishes.');
      return false;
    }

    const password = prompt('Enter admin password to modify recipes/dishes:');
    
    if (password === ADMIN_PASSWORD) {
      this.accessLevel = 'admin';
      sessionStorage.setItem('accessLevel', 'admin');
      return true;
    } else if (password !== null) {
      alert('Incorrect password!');
    }
    
    return false;
  }

  private initializeFirebase(): void {
    const db = initFirebase();
    this.useFirebase = db !== null;

    if (this.useFirebase) {
      console.log('🔥 Firebase connected! Syncing recipes and dishes...');
      
      // Listen for recipe changes from Firebase
      listenToRecipes((firebaseRecipes) => {
        if (Array.isArray(firebaseRecipes)) {
          this.recipes = firebaseRecipes;
          const changed = this.applyAutoAllergensToRecipes(this.recipes);
          if (changed) {
            this.saveToStorage();
          } else {
            localStorage.setItem('recipes', JSON.stringify(this.recipes)); // Save to localStorage without triggering Firebase
          }
          this.render();
        }
      });

      // Listen for dish changes from Firebase
      listenToDishes((firebaseDishes) => {
        if (Array.isArray(firebaseDishes)) {
          this.dishes = firebaseDishes;
          localStorage.setItem('dishes', JSON.stringify(this.dishes)); // Save to localStorage without triggering Firebase
          this.render();
        }
      });

      // Listen for master ingredients changes from Firebase
      listenToMasterIngredients((firebaseIngredients) => {
        if (Array.isArray(firebaseIngredients)) {
          this.masterIngredients = firebaseIngredients;
          localStorage.setItem('masterIngredients', JSON.stringify(this.masterIngredients)); // Save to localStorage without triggering Firebase
          this.render();
        }
      });

      // Listen for allergen keyword changes from Firebase
      listenToAllergenKeywords((firebaseKeywords) => {
        this.allergenKeywords = this.normalizeAllergenKeywords(firebaseKeywords);
        localStorage.setItem('allergenKeywords', JSON.stringify(this.allergenKeywords));

        if (this.applyAutoAllergensToRecipes(this.recipes)) {
          this.saveToStorage();
        }
        this.render();
      });

      // Upload current data to Firebase
      if (this.recipes.length > 0) {
        saveRecipesToFirebase(this.recipes);
      }
      if (this.dishes.length > 0) {
        saveDishesToFirebase(this.dishes);
      }
      if (this.masterIngredients.length > 0) {
        saveMasterIngredientsToFirebase(this.masterIngredients);
      }
      if (Object.keys(this.allergenKeywords).length > 0) {
        saveAllergenKeywordsToFirebase(this.allergenKeywords);
      }
    } else {
      console.log('📦 Using localStorage only');
    }
  }

  private setupEventListeners(): void {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        this.logout();
      }
    });

    // Add recipe form
    const recipeForm = document.getElementById('recipeForm') as HTMLFormElement;
    recipeForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.addRecipe();
    });

    // Add allergy filter
    const addAllergyBtn = document.getElementById('addAllergyBtn');
    const allergyInput = document.getElementById('allergyInput') as HTMLInputElement;
    
    addAllergyBtn?.addEventListener('click', () => {
      this.addAllergyFilter();
    });

    allergyInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addAllergyFilter();
      }
    });

    // Ingredient manager
    const addIngredientBtn = document.getElementById('addIngredientBtn');
    const newIngredientInput = document.getElementById('newIngredientInput') as HTMLInputElement;
    
    addIngredientBtn?.addEventListener('click', () => {
      this.addMasterIngredient();
    });

    newIngredientInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addMasterIngredient();
      }
    });

    // Collapse buttons
    document.querySelectorAll('.collapse-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).getAttribute('data-target');
        if (target) {
          this.toggleCollapse(target, e.target as HTMLElement);
        }
      });
    });

    // Export recipes
    const exportBtn = document.getElementById('exportBtn');
    exportBtn?.addEventListener('click', () => {
      this.exportRecipes();
    });

    // Import recipes
    const importBtn = document.getElementById('importBtn');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    
    importBtn?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.importRecipes(file);
      }
    });

    // Dish form
    const dishForm = document.getElementById('dishForm') as HTMLFormElement;
    dishForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.addDish();
    });
  }

  private async addRecipe(): Promise<void> {
    if (!await this.authenticate()) return;

    const nameInput = document.getElementById('recipeName') as HTMLInputElement;
    const ingredientsInput = document.getElementById('recipeIngredients') as HTMLTextAreaElement;
    const instructionsInput = document.getElementById('recipeInstructions') as HTMLTextAreaElement;

    const name = nameInput.value.trim();
    const ingredientsText = ingredientsInput.value.trim();
    const instructions = instructionsInput.value.trim();

    if (!name) return;

    // Get selected ingredients from checkboxes (with optional amounts)
    const selectedIngredients = Array.from(
      document.querySelectorAll<HTMLInputElement>('#ingredientCheckboxes input[type="checkbox"]:checked')
    ).map(cb => {
      const row = cb.closest('.ingredient-checkbox-row');
      const amountInput = row?.querySelector<HTMLInputElement>('.ingredient-amount-input');
      const amount = amountInput?.value.trim();
      const baseName = cb.value.toLowerCase();
      return amount ? `${baseName} — ${amount}` : baseName;
    });

    // Get manual ingredients from textarea
    const manualIngredients = ingredientsText
      .split(',')
      .map(ing => ing.trim().toLowerCase())
      .filter(ing => ing.length > 0);

    // Combine both sources
    const allIngredients = [...new Set([...selectedIngredients, ...manualIngredients])];

    if (allIngredients.length === 0) {
      alert('Please select or enter at least one ingredient');
      return;
    }

    const recipe: Recipe = {
      id: Date.now().toString(),
      name,
      ingredients: allIngredients,
      instructions
    };

    recipe.allergies = this.mergeAllergies(recipe.allergies ?? [], this.detectAllergensFromIngredients(allIngredients));

    this.recipes.push(recipe);
    this.saveToStorage();
    this.render();

    // Clear form
    nameInput.value = '';
    ingredientsInput.value = '';
    instructionsInput.value = '';
    // Uncheck all ingredient checkboxes and clear amounts
    document.querySelectorAll<HTMLInputElement>('#ingredientCheckboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll<HTMLInputElement>('#ingredientCheckboxes .ingredient-amount-input').forEach(input => {
      input.value = '';
    });
  }

  private addMasterIngredient(): void {
    const input = document.getElementById('newIngredientInput') as HTMLInputElement;
    const ingredient = input.value.trim().toLowerCase();

    if (ingredient && !this.masterIngredients.includes(ingredient)) {
      this.masterIngredients.push(ingredient);
      this.masterIngredients.sort();
      this.saveToStorage();
      input.value = '';
      this.render();
    }
  }

  private removeMasterIngredient(ingredient: string): void {
    this.masterIngredients = this.masterIngredients.filter(i => i !== ingredient);
    this.saveToStorage();
    this.render();
  }

  private async addDish(): Promise<void> {
    if (!await this.authenticate()) return;

    const nameInput = document.getElementById('dishName') as HTMLInputElement;
    const notesInput = document.getElementById('dishNotes') as HTMLTextAreaElement;
    const dishIngredientsInput = document.getElementById('dishIngredients') as HTMLTextAreaElement;
    const dishCategorySelect = document.getElementById('dishCategory') as HTMLSelectElement | null;
    
    const name = nameInput.value.trim();
    const notes = notesInput.value.trim();
    const extraIngredientsText = dishIngredientsInput?.value.trim() || '';
    const category = (dishCategorySelect?.value || 'lunch') as DishCategory;

    if (!name) return;

    // Get selected recipes
    const checkboxes = document.querySelectorAll<HTMLInputElement>('#recipeCheckboxes input[type="checkbox"]:checked');
    const recipeIds = Array.from(checkboxes).map(cb => cb.value);

    if (recipeIds.length === 0) {
      alert('Please select at least one recipe for this dish');
      return;
    }

    // Get selected extra ingredients from master list (with optional amounts)
    const selectedDishIngredients = Array.from(
      document.querySelectorAll<HTMLInputElement>('#dishIngredientCheckboxes input[type="checkbox"]:checked')
    ).map(cb => {
      const row = cb.closest('.ingredient-checkbox-row');
      const amountInput = row?.querySelector<HTMLInputElement>('.ingredient-amount-input');
      const amount = amountInput?.value.trim();
      const baseName = cb.value.toLowerCase();
      return amount ? `${baseName} — ${amount}` : baseName;
    });

    const manualDishIngredients = extraIngredientsText
      .split(',')
      .map(ing => ing.trim().toLowerCase())
      .filter(ing => ing.length > 0);

    const extraIngredients = [...new Set([...selectedDishIngredients, ...manualDishIngredients])];

    const dish: Dish = {
      id: Date.now().toString(),
      name,
      recipeIds,
      ingredients: extraIngredients.length > 0 ? extraIngredients : [],
      allergies: [],
      category,
      notes
    };

    this.dishes.push(dish);
    this.saveToStorage();
    this.render();

    // Clear form
    nameInput.value = '';
    notesInput.value = '';
    if (dishIngredientsInput) dishIngredientsInput.value = '';
    if (dishCategorySelect) dishCategorySelect.value = 'lunch';
    checkboxes.forEach(cb => (cb as HTMLInputElement).checked = false);
    document.querySelectorAll<HTMLInputElement>('#dishIngredientCheckboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll<HTMLInputElement>('#dishIngredientCheckboxes .ingredient-amount-input').forEach(input => {
      input.value = '';
    });
  }

  private addAllergyFilter(): void {
    const input = document.getElementById('allergyInput') as HTMLInputElement;
    const allergen = input.value.trim().toLowerCase();

    if (allergen && !this.allergyFilters.has(allergen)) {
      this.allergyFilters.add(allergen);
      input.value = '';
      this.render();
    }
  }

  private removeAllergyFilter(allergen: string): void {
    this.allergyFilters.delete(allergen);
    this.render();
  }

  private toggleCollapse(targetId: string, button: HTMLElement): void {
    const target = document.getElementById(targetId);
    if (!target) return;

    const isCollapsed = target.classList.contains('collapsed');
    
    if (isCollapsed) {
      target.classList.remove('collapsed');
      button.textContent = '▼';
    } else {
      target.classList.add('collapsed');
      button.textContent = '▶';
    }
  }

  private async deleteRecipe(id: string): Promise<void> {
    if (!await this.authenticate()) return;

    this.recipes = this.recipes.filter(recipe => recipe.id !== id);
    this.saveToStorage();
    this.render();
  }

  private async deleteDish(id: string): Promise<void> {
    if (!await this.authenticate()) return;

    this.dishes = this.dishes.filter(dish => dish.id !== id);
    this.saveToStorage();
    this.render();
  }

  private addAllergyToRecipe(recipeId: string, allergy: string): void {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    if (!recipe.allergies) {
      recipe.allergies = [];
    }

    const allergyLower = allergy.trim().toLowerCase();
    if (allergyLower && !recipe.allergies.some(a => a.toLowerCase() === allergyLower)) {
      recipe.allergies.push(allergyLower);
      this.saveToStorage();
      this.render();
    }
  }

  private removeAllergyFromRecipe(recipeId: string, allergy: string): void {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe || !recipe.allergies) return;

    recipe.allergies = recipe.allergies.filter(a => a.toLowerCase() !== allergy.toLowerCase());
    this.saveToStorage();
    this.render();
  }

  private normalizeAllergenKeywords(raw: Record<string, string[]> | null | undefined): AllergenKeywords {
    const normalized: AllergenKeywords = { ...DEFAULT_ALLERGEN_KEYWORDS };
    if (!raw || typeof raw !== 'object') return normalized;

    Object.entries(raw).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        normalized[key.toLowerCase()] = value
          .map(keyword => keyword.trim().toLowerCase())
          .filter(keyword => keyword.length > 0);
      }
    });

    return normalized;
  }

  private mergeAllergies(existing: string[], detected: string[]): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    const add = (value: string) => {
      const normalized = value.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(normalized);
    };

    existing.forEach(add);
    detected.forEach(add);

    return merged;
  }

  private detectAllergensFromIngredients(ingredients: string[]): string[] {
    const found = new Set<string>();

    ingredients.forEach(ingredient => {
      const lower = ingredient.toLowerCase();
      Object.entries(this.allergenKeywords).forEach(([allergen, keywords]) => {
        if (keywords.some(keyword => lower.includes(keyword))) {
          found.add(allergen);
        }
      });
    });

    return Array.from(found);
  }

  private applyAutoAllergensToRecipes(recipes: Recipe[]): boolean {
    let changed = false;

    recipes.forEach(recipe => {
      const detected = this.detectAllergensFromIngredients(recipe.ingredients);
      const current = this.mergeAllergies(recipe.allergies ?? [], []);
      const merged = this.mergeAllergies(current, detected);

      if (current.length !== merged.length || current.some((value, index) => value !== merged[index])) {
        recipe.allergies = merged;
        changed = true;
      }
    });

    return changed;
  }

  private addAllergyToDish(dishId: string, allergy: string): void {
    const dish = this.dishes.find(d => d.id === dishId);
    if (!dish) return;

    if (!dish.allergies) {
      dish.allergies = [];
    }

    const allergyLower = allergy.trim().toLowerCase();
    if (allergyLower && !dish.allergies.some(a => a.toLowerCase() === allergyLower)) {
      dish.allergies.push(allergyLower);
      this.saveToStorage();
      this.render();
    }
  }

  private removeAllergyFromDish(dishId: string, allergy: string): void {
    const dish = this.dishes.find(d => d.id === dishId);
    if (!dish || !dish.allergies) return;

    dish.allergies = dish.allergies.filter(a => a.toLowerCase() !== allergy.toLowerCase());
    this.saveToStorage();
    this.render();
  }

  private dishContainsAllergen(dish: Dish): boolean {
    if (this.allergyFilters.size === 0) return false;

    // Check explicit dish allergies first
    if (dish.allergies && dish.allergies.length > 0) {
      const hasExplicitAllergen = dish.allergies.some(allergy => {
        return Array.from(this.allergyFilters).some(allergen => {
          return allergy.toLowerCase().includes(allergen) || allergen.includes(allergy.toLowerCase());
        });
      });
      if (hasExplicitAllergen) return true;
    }
    
    // Check if any recipe in the dish contains an allergen
    const recipeHasAllergen = dish.recipeIds.some(recipeId => {
      const recipe = this.recipes.find(r => r.id === recipeId);
      return recipe ? this.containsAllergen(recipe) : false;
    });

    if (recipeHasAllergen) return true;

    // Check extra dish ingredients
    if (dish.ingredients && dish.ingredients.length > 0) {
      return dish.ingredients.some(ingredient => {
        return Array.from(this.allergyFilters).some(allergen => {
          return ingredient.includes(allergen) || allergen.includes(ingredient);
        });
      });
    }

    return false;
  }

  private containsAllergen(recipe: Recipe): boolean {
    if (this.allergyFilters.size === 0) return false;

    // Check explicit allergies first
    if (recipe.allergies && recipe.allergies.length > 0) {
      const hasExplicitAllergen = recipe.allergies.some(allergy => {
        return Array.from(this.allergyFilters).some(allergen => {
          return allergy.toLowerCase().includes(allergen) || allergen.includes(allergy.toLowerCase());
        });
      });
      if (hasExplicitAllergen) return true;
    }

    // Then check ingredients
    return recipe.ingredients.some(ingredient => {
      return Array.from(this.allergyFilters).some(allergen => {
        return ingredient.includes(allergen) || allergen.includes(ingredient);
      });
    });
  }

  private render(): void {
    this.renderAllergyTags();
    this.renderMasterIngredients();
    this.renderIngredientCheckboxes();
    this.renderDishIngredientCheckboxes();
    this.renderRecipeCheckboxes();
    this.renderRecipes();
    this.renderDishes();
    this.updateUIForAccessLevel();
  }

  private renderMasterIngredients(): void {
    const container = document.getElementById('masterIngredients');
    if (!container) return;

    container.innerHTML = '';

    if (this.masterIngredients.length === 0) {
      container.innerHTML = '<p class="no-ingredients">No ingredients yet. Add ingredients to build your master list!</p>';
      return;
    }

    this.masterIngredients.forEach(ingredient => {
      const tag = document.createElement('div');
      tag.className = 'ingredient-tag';
      tag.innerHTML = `
        <span>${ingredient}</span>
        <button class="remove-ingredient-tag" data-ingredient="${ingredient}">×</button>
      `;
      
      const removeBtn = tag.querySelector('.remove-ingredient-tag');
      removeBtn?.addEventListener('click', () => {
        this.removeMasterIngredient(ingredient);
      });

      container.appendChild(tag);
    });
  }

  private renderIngredientCheckboxes(): void {
    const container = document.getElementById('ingredientCheckboxes');
    if (!container) return;

    container.innerHTML = '';

    if (this.masterIngredients.length === 0) {
      container.innerHTML = '<p class="no-ingredients-note">Add ingredients to master list first</p>';
      return;
    }

    this.masterIngredients.forEach(ingredient => {
      const row = document.createElement('div');
      row.className = 'ingredient-checkbox-row';
      row.innerHTML = `
        <label class="ingredient-checkbox-label">
          <input type="checkbox" value="${ingredient}" />
          <span>${ingredient}</span>
        </label>
        <input
          type="text"
          class="ingredient-amount-input"
          placeholder="amount (e.g., 2 cups)"
          data-ingredient="${ingredient}"
        />
      `;

      const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const amountInput = row.querySelector('.ingredient-amount-input') as HTMLInputElement | null;

      amountInput?.addEventListener('input', () => {
        if (checkbox) {
          checkbox.checked = amountInput.value.trim().length > 0 || checkbox.checked;
        }
      });

      container.appendChild(row);
    });
  }

  private renderDishIngredientCheckboxes(): void {
    const container = document.getElementById('dishIngredientCheckboxes');
    if (!container) return;

    container.innerHTML = '';

    if (this.masterIngredients.length === 0) {
      container.innerHTML = '<p class="no-ingredients-note">Add ingredients to master list first</p>';
      return;
    }

    this.masterIngredients.forEach(ingredient => {
      const row = document.createElement('div');
      row.className = 'ingredient-checkbox-row';
      row.innerHTML = `
        <label class="ingredient-checkbox-label">
          <input type="checkbox" value="${ingredient}" />
          <span>${ingredient}</span>
        </label>
        <input
          type="text"
          class="ingredient-amount-input"
          placeholder="amount (e.g., 2 cups)"
          data-ingredient="${ingredient}"
        />
      `;

      const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const amountInput = row.querySelector('.ingredient-amount-input') as HTMLInputElement | null;

      amountInput?.addEventListener('input', () => {
        if (checkbox) {
          checkbox.checked = amountInput.value.trim().length > 0 || checkbox.checked;
        }
      });

      container.appendChild(row);
    });
  }

  private updateUIForAccessLevel(): void {
    const isReadOnly = this.accessLevel === 'readonly';
    
    // Hide/show forms and buttons based on access level
    const addRecipeSection = document.querySelector('.add-recipe-section');
    const addDishSection = document.querySelector('.add-dish-section');
    const exportImportBtns = document.querySelector('.export-import-buttons');
    const recipeSection = document.querySelector('.recipe-list-section');
    const ingredientSection = document.querySelector('.ingredient-manager-section');
    
    if (addRecipeSection) (addRecipeSection as HTMLElement).style.display = isReadOnly ? 'none' : 'block';
    if (addDishSection) (addDishSection as HTMLElement).style.display = isReadOnly ? 'none' : 'block';
    if (exportImportBtns) (exportImportBtns as HTMLElement).style.display = isReadOnly ? 'none' : 'flex';
    if (recipeSection) (recipeSection as HTMLElement).style.display = isReadOnly ? 'none' : 'block';
    if (ingredientSection) (ingredientSection as HTMLElement).style.display = isReadOnly ? 'none' : 'block';
    
    // Update logout button text
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && isReadOnly) {
      logoutBtn.textContent = 'Logout (Read-Only)';
    } else if (logoutBtn) {
      logoutBtn.textContent = 'Logout';
    }
  }

  private renderAllergyTags(): void {
    const container = document.getElementById('allergyTags');
    if (!container) return;

    container.innerHTML = '';
    
    if (this.allergyFilters.size === 0) {
      container.innerHTML = '<p class="no-filters">No filters active</p>';
      return;
    }

    this.allergyFilters.forEach(allergen => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.innerHTML = `
        <span>${allergen}</span>
        <button class="remove-tag" data-allergen="${allergen}">×</button>
      `;
      
      const removeBtn = tag.querySelector('.remove-tag');
      removeBtn?.addEventListener('click', () => {
        this.removeAllergyFilter(allergen);
      });

      container.appendChild(tag);
    });
  }

  private renderRecipeCheckboxes(): void {
    const container = document.getElementById('recipeCheckboxes');
    if (!container) return;

    container.innerHTML = '';

    if (this.recipes.length === 0) {
      container.innerHTML = '<p class="no-recipes-note">Add recipes first before creating dishes</p>';
      return;
    }

    this.recipes.forEach(recipe => {
      const label = document.createElement('label');
      label.className = 'recipe-checkbox-label';
      label.innerHTML = `
        <input type="checkbox" value="${recipe.id}" />
        <span>${recipe.name}</span>
      `;
      container.appendChild(label);
    });
  }

  private renderRecipes(): void {
    const container = document.getElementById('recipeList');
    if (!container) return;

    container.innerHTML = '';

    if (this.recipes.length === 0) {
      container.innerHTML = '<p class="no-recipes">No recipes yet. Add your first recipe above!</p>';
      return;
    }

    const filteredRecipes = this.recipes.filter(recipe => !this.containsAllergen(recipe));
    const hiddenRecipes = this.recipes.filter(recipe => this.containsAllergen(recipe));

    // Show safe recipes
    filteredRecipes.forEach(recipe => {
      container.appendChild(this.createRecipeCard(recipe, false));
    });

    // Show hidden recipes (grayed out)
    hiddenRecipes.forEach(recipe => {
      container.appendChild(this.createRecipeCard(recipe, true));
    });

    if (filteredRecipes.length === 0 && hiddenRecipes.length > 0) {
      const warning = document.createElement('p');
      warning.className = 'warning';
      warning.textContent = '⚠️ All recipes are hidden due to allergy filters';
      container.prepend(warning);
    }
  }

  private renderDishes(): void {
    const container = document.getElementById('dishList');
    if (!container) return;

    container.innerHTML = '';

    if (this.dishes.length === 0) {
      container.innerHTML = '<p class="no-recipes">No dishes yet. Create a dish from your recipes above!</p>';
      return;
    }

    const safeDishes = this.dishes.filter(dish => !this.dishContainsAllergen(dish));
    const hiddenDishes = this.dishes.filter(dish => this.dishContainsAllergen(dish));

    // Show safe dishes
    safeDishes.forEach(dish => {
      container.appendChild(this.createDishCard(dish, false));
    });

    // Show hidden dishes (grayed out)
    hiddenDishes.forEach(dish => {
      container.appendChild(this.createDishCard(dish, true));
    });

    if (safeDishes.length === 0 && hiddenDishes.length > 0) {
      const warning = document.createElement('p');
      warning.className = 'warning';
      warning.textContent = '⚠️ All dishes are hidden due to allergy filters';
      container.prepend(warning);
    }
  }

  private createDishCard(dish: Dish, isHidden: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = `recipe-card dish-card collapsed ${isHidden ? 'hidden-recipe' : ''}`;

    const dishRecipes = dish.recipeIds
      .map(id => this.recipes.find(r => r.id === id))
      .filter(r => r !== undefined) as Recipe[];

    const matchedAllergens = isHidden ? this.getDishMatchedAllergens(dish) : [];
    const isReadOnly = this.accessLevel === 'readonly';

    const categoryLabel = dish.category
      ? (dish.category === 'cold' ? 'Cold dishes'
        : dish.category === 'hot' ? 'Hot dishes'
        : dish.category === 'dessert' ? 'Desserts'
        : 'Lunch')
      : 'Lunch';

    card.innerHTML = `
      <div class="recipe-header">
        <button class="dish-toggle" type="button" aria-expanded="false">▶</button>
        <h3>🍽️ ${dish.name}</h3>
        <span class="dish-category-badge">${categoryLabel}</span>
        ${!isReadOnly ? `<button class="delete-btn" data-id="${dish.id}">Delete</button>` : ''}
      </div>
      <div class="dish-details">
        ${isHidden ? `<div class="allergy-warning">⚠️ Contains: ${matchedAllergens.join(', ')}</div>` : ''}

        <div class="dish-allergies-section">
          <strong>Allergy Tags:</strong>
          <div class="dish-allergy-tags">
            ${dish.allergies && dish.allergies.length > 0
              ? dish.allergies.map(allergy => `
                <span class="allergy-tag">
                  ${allergy}
                  ${!isReadOnly ? `<button class="remove-allergy-tag" data-dish-id="${dish.id}" data-allergy="${allergy}">×</button>` : ''}
                </span>
              `).join('')
              : '<span class="no-allergies">None</span>'
            }
          </div>
          ${!isReadOnly ? `
            <div class="add-allergy-input">
              <input
                type="text"
                class="dish-allergy-input"
                data-dish-id="${dish.id}"
                placeholder="Add allergy tag"
              />
              <button class="dish-add-allergy-btn" data-dish-id="${dish.id}">+</button>
            </div>
          ` : ''}
        </div>
        
        <div class="dish-recipes">
          <strong>Recipes used:</strong>
          <ul>
            ${dishRecipes.map(recipe => {
              const hasAllergen = this.containsAllergen(recipe);
              return `<li class="${hasAllergen ? 'allergen-recipe' : ''}">${recipe.name}${hasAllergen ? ' ⚠️' : ''}</li>`;
            }).join('')}
          </ul>
        </div>

        ${dish.ingredients && dish.ingredients.length > 0 ? `
          <div class="dish-ingredients">
            <strong>Extra ingredients:</strong>
            <ul>
              ${dish.ingredients.map(ing => `<li>${ing}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${dish.notes ? `
          <div class="dish-notes">
            <strong>Notes:</strong>
            <p>${dish.notes}</p>
          </div>
        ` : ''}
      </div>
    `;

    const toggleBtn = card.querySelector('.dish-toggle') as HTMLButtonElement | null;
    toggleBtn?.addEventListener('click', () => {
      const isCollapsed = card.classList.toggle('collapsed');
      toggleBtn.textContent = isCollapsed ? '▶' : '▼';
      toggleBtn.setAttribute('aria-expanded', (!isCollapsed).toString());
    });

    const addAllergyBtn = card.querySelector('.dish-add-allergy-btn');
    const allergyInput = card.querySelector('.dish-allergy-input') as HTMLInputElement;

    addAllergyBtn?.addEventListener('click', () => {
      if (allergyInput.value.trim()) {
        this.addAllergyToDish(dish.id, allergyInput.value);
        allergyInput.value = '';
      }
    });

    allergyInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && allergyInput.value.trim()) {
        this.addAllergyToDish(dish.id, allergyInput.value);
        allergyInput.value = '';
      }
    });

    card.querySelectorAll('.remove-allergy-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const allergyToRemove = target.getAttribute('data-allergy');
        const dishId = target.getAttribute('data-dish-id');
        if (allergyToRemove && dishId) {
          this.removeAllergyFromDish(dishId, allergyToRemove);
        }
      });
    });

    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', async () => {
      if (confirm(`Delete dish "${dish.name}"?`)) {
        await this.deleteDish(dish.id);
      }
    });

    return card;
  }

  private getDishMatchedAllergens(dish: Dish): string[] {
    const matched: Set<string> = new Set();
    
    // Check explicit dish allergies
    if (dish.allergies) {
      dish.allergies.forEach(allergy => {
        this.allergyFilters.forEach(allergen => {
          if (allergy.toLowerCase().includes(allergen) || allergen.includes(allergy.toLowerCase())) {
            matched.add(allergen);
          }
        });
      });
    }

    dish.recipeIds.forEach(recipeId => {
      const recipe = this.recipes.find(r => r.id === recipeId);
      if (recipe) {
        const recipeAllergens = this.getMatchedAllergens(recipe);
        recipeAllergens.forEach(a => matched.add(a));
      }
    });

    if (dish.ingredients && dish.ingredients.length > 0) {
      dish.ingredients.forEach(ingredient => {
        this.allergyFilters.forEach(allergen => {
          if (ingredient.includes(allergen) || allergen.includes(ingredient)) {
            matched.add(allergen);
          }
        });
      });
    }

    return Array.from(matched);
  }

  private createRecipeCard(recipe: Recipe, isHidden: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = `recipe-card ${isHidden ? 'hidden-recipe' : ''}`;
    
    const matchedAllergens = isHidden ? this.getMatchedAllergens(recipe) : [];
    const isReadOnly = this.accessLevel === 'readonly';

    card.innerHTML = `
      <div class="recipe-header">
        <h3>${recipe.name}</h3>
        ${!isReadOnly ? `<button class="delete-btn" data-id="${recipe.id}">Delete</button>` : ''}
      </div>
      ${isHidden ? `<div class="allergy-warning">⚠️ Contains: ${matchedAllergens.join(', ')}</div>` : ''}
      
      <div class="recipe-allergies-section">
        <strong>Allergy Tags:</strong>
        <div class="recipe-allergy-tags">
          ${recipe.allergies && recipe.allergies.length > 0 
            ? recipe.allergies.map(allergy => `
              <span class="allergy-tag">
                ${allergy}
                ${!isReadOnly ? `<button class="remove-allergy-tag" data-recipe-id="${recipe.id}" data-allergy="${allergy}">×</button>` : ''}
              </span>
            `).join('')
            : '<span class="no-allergies">None</span>'
          }
        </div>
        ${!isReadOnly ? `
          <div class="add-allergy-input">
            <input 
              type="text" 
              class="allergy-input" 
              data-recipe-id="${recipe.id}"
              placeholder="Add allergy tag"
            />
            <button class="add-allergy-btn" data-recipe-id="${recipe.id}">+</button>
          </div>
        ` : ''}
      </div>

      <div class="recipe-ingredients">
        <strong>Ingredients:</strong>
        <ul>
          ${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}
        </ul>
      </div>
      ${recipe.instructions ? `
        <div class="recipe-instructions">
          <strong>Instructions:</strong>
          <p>${recipe.instructions}</p>
        </div>
      ` : ''}
    `;

    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', async () => {
      if (confirm(`Delete recipe "${recipe.name}"?`)) {
        await this.deleteRecipe(recipe.id);
      }
    });

    // Add allergy tag handlers
    const addAllergyBtn = card.querySelector('.add-allergy-btn');
    const allergyInput = card.querySelector('.allergy-input') as HTMLInputElement;
    
    addAllergyBtn?.addEventListener('click', () => {
      if (allergyInput.value.trim()) {
        this.addAllergyToRecipe(recipe.id, allergyInput.value);
        allergyInput.value = '';
      }
    });

    allergyInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && allergyInput.value.trim()) {
        this.addAllergyToRecipe(recipe.id, allergyInput.value);
        allergyInput.value = '';
      }
    });

    // Remove allergy tag handlers
    card.querySelectorAll('.remove-allergy-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const allergyToRemove = target.getAttribute('data-allergy');
        if (allergyToRemove) {
          this.removeAllergyFromRecipe(recipe.id, allergyToRemove);
        }
      });
    });

    return card;
  }

  private getMatchedAllergens(recipe: Recipe): string[] {
    const matched: Set<string> = new Set();
    
    // Check explicit allergies
    if (recipe.allergies) {
      recipe.allergies.forEach(allergy => {
        this.allergyFilters.forEach(allergen => {
          if (allergy.toLowerCase().includes(allergen) || allergen.includes(allergy.toLowerCase())) {
            matched.add(allergen);
          }
        });
      });
    }

    // Check ingredients
    recipe.ingredients.forEach(ingredient => {
      this.allergyFilters.forEach(allergen => {
        if (ingredient.includes(allergen) || allergen.includes(ingredient)) {
          matched.add(allergen);
        }
      });
    });

    return Array.from(matched);
  }

  private saveToStorage(): void {
    localStorage.setItem('recipes', JSON.stringify(this.recipes));
    localStorage.setItem('dishes', JSON.stringify(this.dishes));
    localStorage.setItem('masterIngredients', JSON.stringify(this.masterIngredients));
    localStorage.setItem('allergenKeywords', JSON.stringify(this.allergenKeywords));
    
    // Sync to Firebase if available
    if (this.useFirebase) {
      const dishesForFirebase = this.dishes.map(dish => ({
        ...dish,
        ingredients: dish.ingredients ?? [],
        allergies: dish.allergies ?? []
      }));
      saveRecipesToFirebase(this.recipes);
      saveDishesToFirebase(dishesForFirebase);
      saveMasterIngredientsToFirebase(this.masterIngredients);
      saveAllergenKeywordsToFirebase(this.allergenKeywords);
    }
    
    this.showSaveIndicator();
  }

  private loadFromStorage(): void {
    const stored = localStorage.getItem('recipes');
    if (stored) {
      try {
        this.recipes = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to load recipes from storage', e);
      }
    }

    const storedDishes = localStorage.getItem('dishes');
    if (storedDishes) {
      try {
        this.dishes = JSON.parse(storedDishes);
      } catch (e) {
        console.error('Failed to load dishes from storage', e);
      }
    }

    const storedIngredients = localStorage.getItem('masterIngredients');
    if (storedIngredients) {
      try {
        this.masterIngredients = JSON.parse(storedIngredients);
      } catch (e) {
        console.error('Failed to load master ingredients from storage', e);
      }
    }

    const storedAllergenKeywords = localStorage.getItem('allergenKeywords');
    if (storedAllergenKeywords) {
      try {
        const parsed = JSON.parse(storedAllergenKeywords) as Record<string, string[]>;
        this.allergenKeywords = this.normalizeAllergenKeywords(parsed);
      } catch (e) {
        console.error('Failed to load allergen keywords from storage', e);
      }
    }

    if (this.applyAutoAllergensToRecipes(this.recipes)) {
      localStorage.setItem('recipes', JSON.stringify(this.recipes));
    }
  }

  private exportRecipes(): void {
    const dataStr = JSON.stringify(this.recipes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.download = `recipes-${date}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    this.showNotification('Recipes exported successfully!', 'success');
  }

  private importRecipes(file: File): void {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as Recipe[];
        
        if (!Array.isArray(imported)) {
          throw new Error('Invalid format');
        }

        // Validate recipe structure
        const valid = imported.every(recipe => 
          recipe.name && recipe.ingredients && Array.isArray(recipe.ingredients)
        );

        if (!valid) {
          throw new Error('Invalid recipe format');
        }

        // Ask user if they want to merge or replace
        const merge = confirm(
          `Import ${imported.length} recipe(s)?\n\n` +
          `Click OK to ADD to existing recipes\n` +
          `Click Cancel to REPLACE all recipes`
        );

        if (merge) {
          // Add imported recipes with new IDs
          imported.forEach(recipe => {
            this.recipes.push({
              ...recipe,
              id: Date.now().toString() + Math.random()
            });
          });
        } else {
          this.recipes = imported.map(recipe => ({
            ...recipe,
            id: recipe.id || Date.now().toString() + Math.random()
          }));
        }

        this.saveToStorage();
        this.render();
        this.showNotification('Recipes imported successfully!', 'success');
      } catch (error) {
        this.showNotification('Failed to import recipes. Invalid file format.', 'error');
        console.error('Import error:', error);
      }
    };

    reader.readAsText(file);
  }

  private showSaveIndicator(): void {
    // Create temporary save indicator
    const indicator = document.createElement('div');
    indicator.className = 'save-indicator';
    indicator.textContent = '✓ Saved';
    document.body.appendChild(indicator);

    setTimeout(() => {
      indicator.classList.add('fade-out');
      setTimeout(() => indicator.remove(), 300);
    }, 1500);
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize the app
new RecipeManager();
