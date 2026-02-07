import './style.css'
import { initFirebase, saveRecipesToFirebase, listenToRecipes, saveDishesToFirebase, listenToDishes } from './firebase'

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
  notes?: string;
}

class RecipeManager {
  private recipes: Recipe[] = [];
  private dishes: Dish[] = [];
  private allergyFilters: Set<string> = new Set();
  private useFirebase: boolean = false;

  constructor() {
    this.loadFromStorage();
    this.initializeFirebase();
    this.setupEventListeners();
    this.render();
  }

  private initializeFirebase(): void {
    const db = initFirebase();
    this.useFirebase = db !== null;

    if (this.useFirebase) {
      console.log('🔥 Firebase connected! Syncing recipes and dishes...');
      
      // Listen for recipe changes from Firebase
      listenToRecipes((firebaseRecipes) => {
        if (Array.isArray(firebaseRecipes) && firebaseRecipes.length > 0) {
          this.recipes = firebaseRecipes;
          this.saveToStorage(); // Also keep local backup
          this.render();
        }
      });

      // Listen for dish changes from Firebase
      listenToDishes((firebaseDishes) => {
        if (Array.isArray(firebaseDishes) && firebaseDishes.length > 0) {
          this.dishes = firebaseDishes;
          this.saveToStorage(); // Also keep local backup
          this.render();
        }
      });

      // Upload current data if Firebase is empty
      if (this.recipes.length > 0) {
        saveRecipesToFirebase(this.recipes);
      }
      if (this.dishes.length > 0) {
        saveDishesToFirebase(this.dishes);
      }
    } else {
      console.log('📦 Using localStorage only');
    }
  }

  private setupEventListeners(): void {
    // Add recipe form
    const recipeForm = document.getElementById('recipeForm') as HTMLFormElement;
    recipeForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addRecipe();
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
    dishForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addDish();
    });
  }

  private addRecipe(): void {
    const nameInput = document.getElementById('recipeName') as HTMLInputElement;
    const ingredientsInput = document.getElementById('recipeIngredients') as HTMLTextAreaElement;
    const instructionsInput = document.getElementById('recipeInstructions') as HTMLTextAreaElement;

    const name = nameInput.value.trim();
    const ingredientsText = ingredientsInput.value.trim();
    const instructions = instructionsInput.value.trim();

    if (!name || !ingredientsText) return;

    const ingredients = ingredientsText
      .split(',')
      .map(ing => ing.trim().toLowerCase())
      .filter(ing => ing.length > 0);

    const recipe: Recipe = {
      id: Date.now().toString(),
      name,
      ingredients,
      instructions
    };

    this.recipes.push(recipe);
    this.saveToStorage();
    this.render();

    // Clear form
    nameInput.value = '';
    ingredientsInput.value = '';
    instructionsInput.value = '';
  }

  private addDish(): void {
    const nameInput = document.getElementById('dishName') as HTMLInputElement;
    const notesInput = document.getElementById('dishNotes') as HTMLTextAreaElement;
    
    const name = nameInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name) return;

    // Get selected recipes
    const checkboxes = document.querySelectorAll<HTMLInputElement>('#recipeCheckboxes input[type="checkbox"]:checked');
    const recipeIds = Array.from(checkboxes).map(cb => cb.value);

    if (recipeIds.length === 0) {
      alert('Please select at least one recipe for this dish');
      return;
    }

    const dish: Dish = {
      id: Date.now().toString(),
      name,
      recipeIds,
      notes
    };

    this.dishes.push(dish);
    this.saveToStorage();
    this.render();

    // Clear form
    nameInput.value = '';
    notesInput.value = '';
    checkboxes.forEach(cb => (cb as HTMLInputElement).checked = false);
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

  private deleteRecipe(id: string): void {
    this.recipes = this.recipes.filter(recipe => recipe.id !== id);
    this.saveToStorage();
    this.render();
  }

  private deleteDish(id: string): void {
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

  private dishContainsAllergen(dish: Dish): boolean {
    if (this.allergyFilters.size === 0) return false;
    
    // Check if any recipe in the dish contains an allergen
    return dish.recipeIds.some(recipeId => {
      const recipe = this.recipes.find(r => r.id === recipeId);
      return recipe ? this.containsAllergen(recipe) : false;
    });
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
    this.renderRecipeCheckboxes();
    this.renderRecipes();
    this.renderDishes();
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
    card.className = `recipe-card dish-card ${isHidden ? 'hidden-recipe' : ''}`;

    const dishRecipes = dish.recipeIds
      .map(id => this.recipes.find(r => r.id === id))
      .filter(r => r !== undefined) as Recipe[];

    const matchedAllergens = isHidden ? this.getDishMatchedAllergens(dish) : [];

    card.innerHTML = `
      <div class="recipe-header">
        <h3>🍽️ ${dish.name}</h3>
        <button class="delete-btn" data-id="${dish.id}">Delete</button>
      </div>
      ${isHidden ? `<div class="allergy-warning">⚠️ Contains: ${matchedAllergens.join(', ')}</div>` : ''}
      
      <div class="dish-recipes">
        <strong>Recipes used:</strong>
        <ul>
          ${dishRecipes.map(recipe => {
            const hasAllergen = this.containsAllergen(recipe);
            return `<li class="${hasAllergen ? 'allergen-recipe' : ''}">${recipe.name}${hasAllergen ? ' ⚠️' : ''}</li>`;
          }).join('')}
        </ul>
      </div>

      ${dish.notes ? `
        <div class="dish-notes">
          <strong>Notes:</strong>
          <p>${dish.notes}</p>
        </div>
      ` : ''}
    `;

    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn?.addEventListener('click', () => {
      if (confirm(`Delete dish "${dish.name}"?`)) {
        this.deleteDish(dish.id);
      }
    });

    return card;
  }

  private getDishMatchedAllergens(dish: Dish): string[] {
    const matched: Set<string> = new Set();
    
    dish.recipeIds.forEach(recipeId => {
      const recipe = this.recipes.find(r => r.id === recipeId);
      if (recipe) {
        const recipeAllergens = this.getMatchedAllergens(recipe);
        recipeAllergens.forEach(a => matched.add(a));
      }
    });

    return Array.from(matched);
  }

  private createRecipeCard(recipe: Recipe, isHidden: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = `recipe-card ${isHidden ? 'hidden-recipe' : ''}`;
    
    const matchedAllergens = isHidden ? this.getMatchedAllergens(recipe) : [];

    card.innerHTML = `
      <div class="recipe-header">
        <h3>${recipe.name}</h3>
        <button class="delete-btn" data-id="${recipe.id}">Delete</button>
      </div>
      ${isHidden ? `<div class="allergy-warning">⚠️ Contains: ${matchedAllergens.join(', ')}</div>` : ''}
      
      <div class="recipe-allergies-section">
        <strong>Allergy Tags:</strong>
        <div class="recipe-allergy-tags">
          ${recipe.allergies && recipe.allergies.length > 0 
            ? recipe.allergies.map(allergy => `
              <span class="allergy-tag">
                ${allergy}
                <button class="remove-allergy-tag" data-recipe-id="${recipe.id}" data-allergy="${allergy}">×</button>
              </span>
            `).join('')
            : '<span class="no-allergies">None</span>'
          }
        </div>
        <div class="add-allergy-input">
          <input 
            type="text" 
            class="allergy-input" 
            data-recipe-id="${recipe.id}"
            placeholder="Add allergy tag"
          />
          <button class="add-allergy-btn" data-recipe-id="${recipe.id}">+</button>
        </div>
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
    deleteBtn?.addEventListener('click', () => {
      if (confirm(`Delete recipe "${recipe.name}"?`)) {
        this.deleteRecipe(recipe.id);
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
    
    // Sync to Firebase if available
    if (this.useFirebase) {
      saveRecipesToFirebase(this.recipes);
      saveDishesToFirebase(this.dishes);
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
