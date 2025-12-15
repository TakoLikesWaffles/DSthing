import tkinter as tk
from tkinter import colorchooser
from PIL import Image, ImageDraw
import os
import sys

class WhiteboardApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Whiteboard App")
        
        # Set window icon if PaintIcon.png exists in the same directory
        icon_path = self.find_icon()
        if icon_path:
            try:
                icon_img = Image.open(icon_path)
                # Convert to PhotoImage for tkinter
                from PIL import ImageTk
                icon_photo = ImageTk.PhotoImage(icon_img)
                self.root.iconphoto(True, icon_photo)
            except:
                pass
        
        # Canvas setup
        self.canvas_width = 800
        self.canvas_height = 600
        self.canvas = tk.Canvas(root, width=self.canvas_width, height=self.canvas_height, 
                                bg='white', cursor='crosshair')
        self.canvas.pack(pady=10)
        
        # Drawing state
        self.brush_color = 'black'
        self.brush_size = 5
        self.eraser_mode = False
        self.old_x = None
        self.old_y = None
        
        # History for undo/redo
        self.history = []
        self.redo_stack = []
        
        # PIL Image for better drawing
        self.image = Image.new('RGB', (self.canvas_width, self.canvas_height), 'white')
        self.draw = ImageDraw.Draw(self.image)
        
        # Save initial state
        self.save_state()
        
        # Create toolbar
        self.create_toolbar()
        
        # Bind mouse events
        self.canvas.bind('<Button-1>', self.start_draw)
        self.canvas.bind('<B1-Motion>', self.draw_line)
        self.canvas.bind('<ButtonRelease-1>', self.end_draw)
        
        # Keyboard shortcuts
        self.root.bind('<Control-z>', lambda e: self.undo())
        self.root.bind('<Control-y>', lambda e: self.redo())
    
    def find_icon(self):
        """Find PaintIcon.png in the current directory or script directory"""
        # Try current working directory first
        if os.path.exists('PaintIcon.png'):
            return 'PaintIcon.png'
        
        # Try the directory where the script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        icon_path = os.path.join(script_dir, 'PaintIcon.png')
        if os.path.exists(icon_path):
            return icon_path
        
        # Try common variations
        for name in ['painticon.png', 'icon.png', 'Icon.png']:
            if os.path.exists(name):
                return name
            path = os.path.join(script_dir, name)
            if os.path.exists(path):
                return path
        
        return None
    
    def create_toolbar(self):
        toolbar = tk.Frame(self.root)
        toolbar.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        # Color button
        color_btn = tk.Button(toolbar, text='Color', command=self.choose_color,
                             bg=self.brush_color, width=8)
        color_btn.pack(side=tk.LEFT, padx=2)
        self.color_btn = color_btn
        
        # Brush size
        tk.Label(toolbar, text='Brush Size:').pack(side=tk.LEFT, padx=5)
        self.size_scale = tk.Scale(toolbar, from_=1, to=20, orient=tk.HORIZONTAL,
                                   command=self.change_size)
        self.size_scale.set(self.brush_size)
        self.size_scale.pack(side=tk.LEFT, padx=2)
        
        # Brush button
        brush_btn = tk.Button(toolbar, text='Brush', command=self.use_brush, width=8)
        brush_btn.pack(side=tk.LEFT, padx=2)
        
        # Eraser button
        eraser_btn = tk.Button(toolbar, text='Eraser', command=self.use_eraser, width=8)
        eraser_btn.pack(side=tk.LEFT, padx=2)
        
        # Undo button
        undo_btn = tk.Button(toolbar, text='Undo', command=self.undo, width=8)
        undo_btn.pack(side=tk.LEFT, padx=2)
        
        # Redo button
        redo_btn = tk.Button(toolbar, text='Redo', command=self.redo, width=8)
        redo_btn.pack(side=tk.LEFT, padx=2)
        
        # Clear button
        clear_btn = tk.Button(toolbar, text='Clear', command=self.clear_canvas, width=8)
        clear_btn.pack(side=tk.LEFT, padx=2)
    
    def choose_color(self):
        color = colorchooser.askcolor(color=self.brush_color)[1]
        if color:
            self.brush_color = color
            self.color_btn.config(bg=color)
            self.eraser_mode = False
    
    def change_size(self, val):
        self.brush_size = int(val)
    
    def use_brush(self):
        self.eraser_mode = False
    
    def use_eraser(self):
        self.eraser_mode = True
    
    def start_draw(self, event):
        self.old_x = event.x
        self.old_y = event.y
    
    def draw_line(self, event):
        color = 'white' if self.eraser_mode else self.brush_color
        
        if self.old_x and self.old_y:
            # Draw on canvas
            self.canvas.create_line(self.old_x, self.old_y, event.x, event.y,
                                   width=self.brush_size, fill=color,
                                   capstyle=tk.ROUND, smooth=tk.TRUE)
            
            # Draw on PIL image
            self.draw.line([self.old_x, self.old_y, event.x, event.y],
                          fill=color, width=self.brush_size)
        else:
            # Draw a dot when mouse is stationary
            r = self.brush_size // 2
            self.canvas.create_oval(event.x - r, event.y - r, 
                                   event.x + r, event.y + r,
                                   fill=color, outline=color)
            self.draw.ellipse([event.x - r, event.y - r, 
                             event.x + r, event.y + r],
                            fill=color)
            
        self.old_x = event.x
        self.old_y = event.y
    
    def end_draw(self, event):
        self.old_x = None
        self.old_y = None
        self.save_state()
    
    def save_state(self):
        # Save current canvas state for undo
        state = self.image.copy()
        self.history.append(state)
        # Limit history size
        if len(self.history) > 50:
            self.history.pop(0)
        # Clear redo stack when new action is performed
        self.redo_stack.clear()
    
    def undo(self):
        if len(self.history) > 1:
            # Move current state to redo stack
            self.redo_stack.append(self.history.pop())
            # Restore previous state
            self.image = self.history[-1].copy()
            self.draw = ImageDraw.Draw(self.image)
            self.redraw_canvas()
    
    def redo(self):
        if self.redo_stack:
            # Restore state from redo stack
            state = self.redo_stack.pop()
            self.history.append(state)
            self.image = state.copy()
            self.draw = ImageDraw.Draw(self.image)
            self.redraw_canvas()
    
    def redraw_canvas(self):
        # Clear canvas and redraw from PIL image
        self.canvas.delete('all')
        # Convert PIL image to PhotoImage and display
        from PIL import ImageTk
        # Keep a reference to prevent garbage collection
        self.tk_image = ImageTk.PhotoImage(self.image)
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self.tk_image)
    
    def clear_canvas(self):
        self.canvas.delete('all')
        self.image = Image.new('RGB', (self.canvas_width, self.canvas_height), 'white')
        self.draw = ImageDraw.Draw(self.image)
        self.save_state()

if __name__ == '__main__':
    root = tk.Tk()
    app = WhiteboardApp(root)
    root.mainloop()