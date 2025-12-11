
import sys, json, os
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QSlider, QLabel, QColorDialog, QFileDialog,
    QListWidget, QInputDialog, QComboBox, QSpinBox, QMessageBox
)
from PyQt6.QtCore import Qt, QPoint, QRect, QTimer
from PyQt6.QtGui import (
    QPixmap, QPainter, QPen, QColor, QBrush, QImage, 
    QFont, QIcon, QPainterPath
)

class Layer:
    def __init__(self, name, width, height):
        self.name = name
        self.visible = True
        self.opacity = 100
        self.canvas = QPixmap(width, height)
        self.canvas.fill(Qt.GlobalColor.transparent)

class DrawingCanvas(QWidget):
    def __init__(self, width=1200, height=800):
        super().__init__()
        self.setFixedSize(width, height)
        self.width = width
        self.height = height
        
        # Layers
        self.layers = [Layer("Background", width, height)]
        self.current_layer_index = 0
        
        # Fill background with white
        painter = QPainter(self.layers[0].canvas)
        painter.fillRect(0, 0, width, height, Qt.GlobalColor.white)
        painter.end()
        
        # Tool state
        self.tool = "brush"  # brush, eraser, line, rect, circle, text, select, move
        self.drawing = False
        self.last_point = QPoint()
        self.start_point = QPoint()
        
        # Brush settings
        self.pen_color = QColor(0, 0, 0)
        self.pen_width = 3
        self.pen_opacity = 255
        
        # History for undo/redo
        self.history = []
        self.history_index = -1
        self.max_history = 50
        
        # Text tool
        self.text_content = ""
        self.text_size = 20
        
        # Selection
        self.selection_rect = None
        self.selected_image = None
        self.move_offset = QPoint()
        
        self.save_state()

    def save_state(self):
        # Save current state for undo
        state = []
        for layer in self.layers:
            state.append({
                'name': layer.name,
                'visible': layer.visible,
                'opacity': layer.opacity,
                'canvas': layer.canvas.copy()
            })
        
        # Remove future history if we're not at the end
        if self.history_index < len(self.history) - 1:
            self.history = self.history[:self.history_index + 1]
        
        self.history.append(state)
        if len(self.history) > self.max_history:
            self.history.pop(0)
        else:
            self.history_index += 1

    def undo(self):
        if self.history_index > 0:
            self.history_index -= 1
            self.restore_state(self.history[self.history_index])
            self.update()

    def redo(self):
        if self.history_index < len(self.history) - 1:
            self.history_index += 1
            self.restore_state(self.history[self.history_index])
            self.update()

    def restore_state(self, state):
        self.layers.clear()
        for layer_data in state:
            layer = Layer(layer_data['name'], self.width, self.height)
            layer.visible = layer_data['visible']
            layer.opacity = layer_data['opacity']
            layer.canvas = layer_data['canvas'].copy()
            self.layers.append(layer)

    def get_current_layer(self):
        if 0 <= self.current_layer_index < len(self.layers):
            return self.layers[self.current_layer_index]
        return self.layers[0]

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drawing = True
            self.last_point = event.pos()
            self.start_point = event.pos()
            
            if self.tool == "text":
                text, ok = QInputDialog.getText(self, "Text Input", "Enter text:")
                if ok and text:
                    self.text_content = text
                    self.draw_text(event.pos())
            elif self.tool == "select":
                self.selection_rect = QRect(self.start_point, self.start_point)

    def mouseMoveEvent(self, event):
        if self.drawing and event.buttons() & Qt.MouseButton.LeftButton:
            if self.tool == "brush" or self.tool == "eraser":
                self.draw_line(self.last_point, event.pos())
                self.last_point = event.pos()
            elif self.tool == "select":
                self.selection_rect = QRect(self.start_point, event.pos()).normalized()
                self.update()
            elif self.tool == "move" and self.selected_image:
                self.move_offset = event.pos() - self.start_point
                self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.drawing:
            if self.tool in ["line", "rect", "circle"]:
                self.draw_shape(self.start_point, event.pos())
            elif self.tool == "select" and self.selection_rect:
                self.selected_image = self.get_current_layer().canvas.copy(self.selection_rect)
                self.tool = "move"
            elif self.tool == "move" and self.selected_image:
                self.paste_selection()
            
            self.drawing = False
            if self.tool not in ["select", "move"]:
                self.save_state()

    def draw_line(self, start, end):
        layer = self.get_current_layer()
        painter = QPainter(layer.canvas)
        
        if self.tool == "eraser":
            painter.setCompositionMode(QPainter.CompositionMode.CompositionMode_Clear)
            pen = QPen(Qt.GlobalColor.transparent, self.pen_width * 2, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap)
        else:
            color = QColor(self.pen_color)
            color.setAlpha(self.pen_opacity)
            pen = QPen(color, self.pen_width, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap)
        
        painter.setPen(pen)
        painter.drawLine(start, end)
        painter.end()
        self.update()

    def draw_shape(self, start, end):
        layer = self.get_current_layer()
        painter = QPainter(layer.canvas)
        
        color = QColor(self.pen_color)
        color.setAlpha(self.pen_opacity)
        pen = QPen(color, self.pen_width)
        painter.setPen(pen)
        
        if self.tool == "line":
            painter.drawLine(start, end)
        elif self.tool == "rect":
            rect = QRect(start, end).normalized()
            painter.drawRect(rect)
        elif self.tool == "circle":
            rect = QRect(start, end).normalized()
            painter.drawEllipse(rect)
        
        painter.end()
        self.update()

    def draw_text(self, pos):
        if not self.text_content:
            return
        
        layer = self.get_current_layer()
        painter = QPainter(layer.canvas)
        
        color = QColor(self.pen_color)
        color.setAlpha(self.pen_opacity)
        painter.setPen(color)
        painter.setFont(QFont("Arial", self.text_size))
        painter.drawText(pos, self.text_content)
        
        painter.end()
        self.save_state()
        self.update()

    def paste_selection(self):
        if self.selected_image and self.selection_rect:
            layer = self.get_current_layer()
            painter = QPainter(layer.canvas)
            
            new_pos = self.selection_rect.topLeft() + self.move_offset
            painter.drawPixmap(new_pos, self.selected_image)
            
            painter.end()
            self.selection_rect = None
            self.selected_image = None
            self.move_offset = QPoint()
            self.save_state()
            self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        
        # Draw all visible layers
        for layer in self.layers:
            if layer.visible:
                painter.setOpacity(layer.opacity / 100.0)
                painter.drawPixmap(0, 0, layer.canvas)
        
        painter.setOpacity(1.0)
        
        # Draw selection rectangle
        if self.selection_rect and self.tool == "select":
            painter.setPen(QPen(Qt.GlobalColor.blue, 2, Qt.PenStyle.DashLine))
            painter.drawRect(self.selection_rect)
        
        # Draw moving selection
        if self.selected_image and self.tool == "move":
            new_pos = self.selection_rect.topLeft() + self.move_offset
            painter.drawPixmap(new_pos, self.selected_image)

    def clear_canvas(self):
        layer = self.get_current_layer()
        layer.canvas.fill(Qt.GlobalColor.transparent)
        self.save_state()
        self.update()

    def fill_with_color(self, color):
        layer = self.get_current_layer()
        layer.canvas.fill(color)
        self.save_state()
        self.update()

class WhiteboardApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Whiteboard - Drawing App")
        self.setGeometry(50, 50, 1400, 900)
        
        # Main widget
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        main_layout = QHBoxLayout(main_widget)
        
        # Left toolbar
        left_toolbar = self.create_left_toolbar()
        main_layout.addLayout(left_toolbar)
        
        # Canvas
        self.canvas = DrawingCanvas()
        main_layout.addWidget(self.canvas)
        
        # Right panel (layers)
        right_panel = self.create_right_panel()
        main_layout.addLayout(right_panel)

    def create_left_toolbar(self):
        toolbar = QVBoxLayout()
        toolbar.setSpacing(5)
        
        # Tools
        tools = [
            ("Brush", "brush"),
            ("Eraser", "eraser"),
            ("Line", "line"),
            ("Rectangle", "rect"),
            ("Circle", "circle"),
            ("Text", "text"),
            ("Select", "select"),
        ]
        
        for name, tool in tools:
            btn = QPushButton(name)
            btn.clicked.connect(lambda checked, t=tool: self.set_tool(t))
            toolbar.addWidget(btn)
        
        toolbar.addWidget(QLabel("───────"))
        
        # Color picker
        color_btn = QPushButton("Color")
        color_btn.clicked.connect(self.pick_color)
        toolbar.addWidget(color_btn)
        
        # Brush size
        toolbar.addWidget(QLabel("Brush Size:"))
        self.size_slider = QSlider(Qt.Orientation.Horizontal)
        self.size_slider.setMinimum(1)
        self.size_slider.setMaximum(50)
        self.size_slider.setValue(3)
        self.size_slider.valueChanged.connect(self.change_brush_size)
        toolbar.addWidget(self.size_slider)
        
        self.size_label = QLabel("3")
        toolbar.addWidget(self.size_label)
        
        # Opacity
        toolbar.addWidget(QLabel("Opacity:"))
        self.opacity_slider = QSlider(Qt.Orientation.Horizontal)
        self.opacity_slider.setMinimum(0)
        self.opacity_slider.setMaximum(255)
        self.opacity_slider.setValue(255)
        self.opacity_slider.valueChanged.connect(self.change_opacity)
        toolbar.addWidget(self.opacity_slider)
        
        self.opacity_label = QLabel("100%")
        toolbar.addWidget(self.opacity_label)
        
        # Text size
        toolbar.addWidget(QLabel("Text Size:"))
        self.text_size_spin = QSpinBox()
        self.text_size_spin.setMinimum(8)
        self.text_size_spin.setMaximum(200)
        self.text_size_spin.setValue(20)
        self.text_size_spin.valueChanged.connect(self.change_text_size)
        toolbar.addWidget(self.text_size_spin)
        
        toolbar.addWidget(QLabel("───────"))
        
        # Undo/Redo
        undo_btn = QPushButton("Undo")
        undo_btn.clicked.connect(self.canvas.undo)
        toolbar.addWidget(undo_btn)
        
        redo_btn = QPushButton("Redo")
        redo_btn.clicked.connect(self.canvas.redo)
        toolbar.addWidget(redo_btn)
        
        # Clear
        clear_btn = QPushButton("Clear Layer")
        clear_btn.clicked.connect(self.canvas.clear_canvas)
        toolbar.addWidget(clear_btn)
        
        toolbar.addWidget(QLabel("───────"))
        
        # File operations
        save_btn = QPushButton("Save Project")
        save_btn.clicked.connect(self.save_project)
        toolbar.addWidget(save_btn)
        
        load_btn = QPushButton("Load Project")
        load_btn.clicked.connect(self.load_project)
        toolbar.addWidget(load_btn)
        
        export_btn = QPushButton("Export PNG")
        export_btn.clicked.connect(self.export_png)
        toolbar.addWidget(export_btn)
        
        import_btn = QPushButton("Import Image")
        import_btn.clicked.connect(self.import_image)
        toolbar.addWidget(import_btn)
        
        toolbar.addStretch()
        return toolbar

    def create_right_panel(self):
        panel = QVBoxLayout()
        panel.addWidget(QLabel("Layers"))
        
        # Layer list
        self.layer_list = QListWidget()
        self.layer_list.itemClicked.connect(self.select_layer)
        panel.addWidget(self.layer_list)
        
        # Layer buttons
        layer_btns = QHBoxLayout()
        
        add_layer_btn = QPushButton("+")
        add_layer_btn.clicked.connect(self.add_layer)
        layer_btns.addWidget(add_layer_btn)
        
        remove_layer_btn = QPushButton("-")
        remove_layer_btn.clicked.connect(self.remove_layer)
        layer_btns.addWidget(remove_layer_btn)
        
        panel.addLayout(layer_btns)
        
        # Layer visibility
        visibility_btn = QPushButton("Toggle Visibility")
        visibility_btn.clicked.connect(self.toggle_layer_visibility)
        panel.addWidget(visibility_btn)
        
        # Layer opacity
        panel.addWidget(QLabel("Layer Opacity:"))
        self.layer_opacity_slider = QSlider(Qt.Orientation.Horizontal)
        self.layer_opacity_slider.setMinimum(0)
        self.layer_opacity_slider.setMaximum(100)
        self.layer_opacity_slider.setValue(100)
        self.layer_opacity_slider.valueChanged.connect(self.change_layer_opacity)
        panel.addWidget(self.layer_opacity_slider)
        
        # Move layer up/down
        move_btns = QHBoxLayout()
        up_btn = QPushButton("↑ Up")
        up_btn.clicked.connect(self.move_layer_up)
        move_btns.addWidget(up_btn)
        
        down_btn = QPushButton("↓ Down")
        down_btn.clicked.connect(self.move_layer_down)
        move_btns.addWidget(down_btn)
        panel.addLayout(move_btns)
        
        self.update_layer_list()
        return panel

    def set_tool(self, tool):
        self.canvas.tool = tool

    def pick_color(self):
        color = QColorDialog.getColor()
        if color.isValid():
            self.canvas.pen_color = color

    def change_brush_size(self, value):
        self.canvas.pen_width = value
        self.size_label.setText(str(value))

    def change_opacity(self, value):
        self.canvas.pen_opacity = value
        self.opacity_label.setText(f"{int(value/255*100)}%")

    def change_text_size(self, value):
        self.canvas.text_size = value

    def update_layer_list(self):
        self.layer_list.clear()
        for i, layer in enumerate(self.canvas.layers):
            vis = "👁" if layer.visible else "🚫"
            self.layer_list.addItem(f"{vis} {layer.name} ({layer.opacity}%)")
        self.layer_list.setCurrentRow(self.canvas.current_layer_index)

    def select_layer(self, item):
        self.canvas.current_layer_index = self.layer_list.row(item)
        layer = self.canvas.get_current_layer()
        self.layer_opacity_slider.setValue(layer.opacity)

    def add_layer(self):
        name, ok = QInputDialog.getText(self, "New Layer", "Layer name:")
        if ok and name:
            layer = Layer(name, self.canvas.width, self.canvas.height)
            self.canvas.layers.append(layer)
            self.canvas.current_layer_index = len(self.canvas.layers) - 1
            self.update_layer_list()
            self.canvas.save_state()

    def remove_layer(self):
        if len(self.canvas.layers) > 1:
            self.canvas.layers.pop(self.canvas.current_layer_index)
            self.canvas.current_layer_index = max(0, self.canvas.current_layer_index - 1)
            self.update_layer_list()
            self.canvas.save_state()
            self.canvas.update()

    def toggle_layer_visibility(self):
        layer = self.canvas.get_current_layer()
        layer.visible = not layer.visible
        self.update_layer_list()
        self.canvas.update()

    def change_layer_opacity(self, value):
        layer = self.canvas.get_current_layer()
        layer.opacity = value
        self.update_layer_list()
        self.canvas.update()

    def move_layer_up(self):
        idx = self.canvas.current_layer_index
        if idx < len(self.canvas.layers) - 1:
            self.canvas.layers[idx], self.canvas.layers[idx + 1] = \
                self.canvas.layers[idx + 1], self.canvas.layers[idx]
            self.canvas.current_layer_index += 1
            self.update_layer_list()
            self.canvas.update()

    def move_layer_down(self):
        idx = self.canvas.current_layer_index
        if idx > 0:
            self.canvas.layers[idx], self.canvas.layers[idx - 1] = \
                self.canvas.layers[idx - 1], self.canvas.layers[idx]
            self.canvas.current_layer_index -= 1
            self.update_layer_list()
            self.canvas.update()

    def save_project(self):
        path, _ = QFileDialog.getSaveFileName(self, "Save Project", "", "Whiteboard Project (*.wbp)")
        if path:
            data = {
                'layers': []
            }
            for layer in self.canvas.layers:
                img_path = path.replace('.wbp', f'_layer_{layer.name}.png')
                layer.canvas.save(img_path)
                data['layers'].append({
                    'name': layer.name,
                    'visible': layer.visible,
                    'opacity': layer.opacity,
                    'image': os.path.basename(img_path)
                })
            
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
            
            QMessageBox.information(self, "Saved", "Project saved successfully!")

    def load_project(self):
        path, _ = QFileDialog.getOpenFileName(self, "Load Project", "", "Whiteboard Project (*.wbp)")
        if path:
            with open(path, 'r') as f:
                data = json.load(f)
            
            self.canvas.layers.clear()
            base_path = os.path.dirname(path)
            
            for layer_data in data['layers']:
                layer = Layer(layer_data['name'], self.canvas.width, self.canvas.height)
                layer.visible = layer_data['visible']
                layer.opacity = layer_data['opacity']
                
                img_path = os.path.join(base_path, layer_data['image'])
                if os.path.exists(img_path):
                    layer.canvas = QPixmap(img_path)
                
                self.canvas.layers.append(layer)
            
            self.canvas.current_layer_index = 0
            self.update_layer_list()
            self.canvas.update()
            QMessageBox.information(self, "Loaded", "Project loaded successfully!")

    def export_png(self):
        path, _ = QFileDialog.getSaveFileName(self, "Export PNG", "", "PNG Image (*.png)")
        if path:
            # Merge all visible layers
            result = QPixmap(self.canvas.width, self.canvas.height)
            result.fill(Qt.GlobalColor.transparent)
            painter = QPainter(result)
            
            for layer in self.canvas.layers:
                if layer.visible:
                    painter.setOpacity(layer.opacity / 100.0)
                    painter.drawPixmap(0, 0, layer.canvas)
            
            painter.end()
            result.save(path)
            QMessageBox.information(self, "Exported", "Image exported successfully!")

    def import_image(self):
        path, _ = QFileDialog.getOpenFileName(self, "Import Image", "", "Images (*.png *.jpg *.jpeg *.bmp)")
        if path:
            pixmap = QPixmap(path)
            layer = self.canvas.get_current_layer()
            painter = QPainter(layer.canvas)
            painter.drawPixmap(0, 0, pixmap)
            painter.end()
            self.canvas.save_state()
            self.canvas.update()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = WhiteboardApp()
    window.show()
    sys.exit(app.exec())
