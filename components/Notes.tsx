
import React, { useState, useEffect, useMemo } from 'react';
import { 
  DndContext, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'motion/react';
import { dbService } from '../lib/db';
import { Task, TaskStatus } from '../types';
import { Plus, Trash2, GripVertical, X, Check, Calendar, Clock, AlignLeft } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotesProps {
  month: string;
  userId: string;
  familyAdminId: string;
}

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'PENDING', label: 'Pendiente', color: 'bg-amber-500' },
  { id: 'DOING', label: 'Haciendo', color: 'bg-indigo-500' },
  { id: 'DONE', label: 'Hecho', color: 'bg-emerald-500' },
];

const DroppableColumn = ({ id, children, column, onAdd, taskCount }: { id: TaskStatus; children: React.ReactNode; column: any; onAdd: () => void; taskCount: number }) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="flex-1 flex flex-col min-w-[300px] bg-slate-100/50 rounded-[2rem] p-4 border border-slate-200/50">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.color}`}></div>
          <h3 className="font-black text-slate-700 uppercase tracking-widest text-xs">{column.label}</h3>
          <span className="bg-white text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
            {taskCount}
          </span>
        </div>
        <button 
          onClick={onAdd}
          className="w-8 h-8 flex items-center justify-center bg-white text-slate-400 hover:text-indigo-600 hover:shadow-md rounded-xl transition-all"
        >
          <Plus size={18} />
        </button>
      </div>
      {children}
    </div>
  );
};

const SortableTaskCard = ({ task, onDelete, onClick }: { task: Task; onDelete: (id: string) => void; onClick: (task: Task) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && task.status !== 'DONE';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick(task)}
      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-3 group relative cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div 
          {...attributes} 
          {...listeners} 
          onClick={(e) => e.stopPropagation()}
          className="mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
        >
          <GripVertical size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">{task.description}</p>
          )}
          {task.due_date && (
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
              <Calendar size={12} />
              <span>{format(new Date(task.due_date), "d 'de' MMM", { locale: es })}</span>
            </div>
          )}
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const Notes: React.FC<NotesProps> = ({ month, userId, familyAdminId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState<TaskStatus | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '' });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadTasks();
  }, [month, familyAdminId]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await dbService.getTasks(month, familyAdminId);
      setTasks(data);
    } catch (error) {
      console.error("Error cargando tareas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (status: TaskStatus) => {
    if (!newTask.title.trim()) return;

    try {
      const maxPos = tasks.filter(t => t.status === status).reduce((max, t) => Math.max(max, t.position), 0);
      const task = await dbService.createTask({
        title: newTask.title,
        description: newTask.description || null,
        status,
        month,
        position: maxPos + 1000,
        due_date: newTask.due_date || null,
        user_id: userId,
        family_admin_id: familyAdminId
      });
      setTasks([...tasks, task]);
      setNewTask({ title: '', description: '', due_date: '' });
      setIsAdding(null);
    } catch (error) {
      console.error("Error creando tarea:", error);
    }
  };

  const handleUpdateTaskDetails = async () => {
    if (!editingTask) return;
    try {
      await dbService.updateTask(editingTask.id, {
        title: editingTask.title,
        description: editingTask.description,
        due_date: editingTask.due_date
      });
      setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t));
      setEditingTask(null);
    } catch (error) {
      console.error("Error actualizando tarea:", error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await dbService.deleteTask(id);
      setTasks(tasks.filter(t => t.id !== id));
      if (editingTask?.id === id) setEditingTask(null);
    } catch (error) {
      console.error("Error eliminando tarea:", error);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Find container of the 'over' element
    const overContainer = COLUMNS.some(c => c.id === overId) 
      ? overId as TaskStatus 
      : tasks.find(t => t.id === overId)?.status;

    if (!overContainer || activeTask.status === overContainer) return;

    setTasks(prev => {
      const activeIndex = prev.findIndex(t => t.id === activeId);
      const newTasks = [...prev];
      newTasks[activeIndex] = { ...activeTask, status: overContainer };
      
      // If over an item, move it to that position
      const overIndex = prev.findIndex(t => t.id === overId);
      if (overIndex !== -1) {
        return arrayMove(newTasks, activeIndex, overIndex);
      }
      
      return newTasks;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    const overContainer = COLUMNS.some(c => c.id === overId) 
      ? overId as TaskStatus 
      : tasks.find(t => t.id === overId)?.status;

    if (!overContainer) return;

    let newTasks = [...tasks];
    const columnTasks = newTasks.filter(t => t.status === overContainer);
    const activeIdxInColumn = columnTasks.findIndex(t => t.id === activeId);
    const overIdxInColumn = columnTasks.findIndex(t => t.id === overId);

    let newPos;
    if (overIdxInColumn === -1) {
      // Dropped on empty column
      const maxPos = columnTasks.reduce((max, t) => Math.max(max, t.position), 0);
      newPos = maxPos + 1000;
    } else if (activeIdxInColumn !== overIdxInColumn) {
      if (overIdxInColumn === 0) {
        newPos = columnTasks[0].position / 2;
      } else if (overIdxInColumn === columnTasks.length - 1) {
        newPos = columnTasks[columnTasks.length - 1].position + 1000;
      } else {
        const prevPos = columnTasks[overIdxInColumn - 1].position;
        const nextPos = columnTasks[overIdxInColumn].position;
        newPos = (prevPos + nextPos) / 2;
      }
    } else {
      newPos = activeTask.position;
    }

    newTasks = newTasks.map(t => t.id === activeId ? { ...t, status: overContainer, position: newPos } : t);
    setTasks(newTasks);
    
    try {
      await dbService.updateTask(activeId, { 
        status: overContainer, 
        position: newPos 
      });
    } catch (error) {
      console.error("Error persistiendo cambio de tarea:", error);
      loadTasks();
    }
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cargando Tablero...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Notas y Tareas</h2>
        <p className="text-slate-500 mt-1">Organiza tus pendientes financieros para este mes.</p>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 no-scrollbar">
        <div className="flex gap-6 h-full min-w-[900px]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {COLUMNS.map((column) => (
              <DroppableColumn 
                key={column.id} 
                id={column.id} 
                column={column} 
                onAdd={() => setIsAdding(column.id)}
                taskCount={tasks.filter(t => t.status === column.id).length}
              >
                <div className="flex-1 overflow-y-auto no-scrollbar px-1">
                  <SortableContext
                    id={column.id}
                    items={tasks.filter(t => t.status === column.id).map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <AnimatePresence initial={false}>
                      {isAdding === column.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white p-4 rounded-2xl shadow-lg border-2 border-indigo-100 mb-4"
                        >
                          <input
                            autoFocus
                            type="text"
                            placeholder="Título de la tarea..."
                            className="w-full font-bold text-slate-800 text-sm mb-2 focus:outline-none placeholder:text-slate-300"
                            value={newTask.title}
                            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask(column.id)}
                          />
                          <textarea
                            placeholder="Descripción (opcional)..."
                            className="w-full text-xs text-slate-500 focus:outline-none resize-none placeholder:text-slate-300 mb-3"
                            rows={2}
                            value={newTask.description}
                            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                          />
                          <div className="flex items-center gap-2 mb-3">
                            <Calendar size={14} className="text-slate-400" />
                            <input 
                              type="date" 
                              className="text-xs text-slate-500 focus:outline-none bg-slate-50 px-2 py-1 rounded-lg border border-slate-100"
                              value={newTask.due_date}
                              onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setIsAdding(null)}
                              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <X size={16} />
                            </button>
                            <button 
                              onClick={() => handleAddTask(column.id)}
                              className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                            >
                              <Check size={16} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {tasks
                      .filter(t => t.status === column.id)
                      .map((task) => (
                        <SortableTaskCard 
                          key={task.id} 
                          task={task} 
                          onDelete={handleDeleteTask} 
                          onClick={setEditingTask}
                        />
                      ))}
                    
                    {tasks.filter(t => t.status === column.id).length === 0 && !isAdding && (
                      <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-300">
                        <p className="text-[10px] font-bold uppercase tracking-widest">Sin tareas</p>
                      </div>
                    )}
                  </SortableContext>
                </div>
              </DroppableColumn>
            ))}

            <DragOverlay dropAnimation={{
              sideEffects: defaultDropAnimationSideEffects({
                styles: {
                  active: {
                    opacity: '0.5',
                  },
                },
              }),
            }}>
              {activeTask ? (
                <div className="bg-white p-4 rounded-2xl shadow-xl border border-indigo-100 w-[280px] cursor-grabbing rotate-2 scale-105 transition-transform">
                  <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{activeTask.title}</h4>
                  {activeTask.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">{activeTask.description}</p>
                  )}
                  {activeTask.due_date && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Calendar size={12} />
                      <span>{format(new Date(activeTask.due_date), "d 'de' MMM", { locale: es })}</span>
                    </div>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Modal de Detalles */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTask(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg ${COLUMNS.find(c => c.id === editingTask.status)?.color}`}>
                      <Check size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 leading-none">Detalles de Tarea</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                        Estado: {COLUMNS.find(c => c.id === editingTask.status)?.label}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingTask(null)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Título</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      value={editingTask.title}
                      onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Descripción</label>
                    <div className="relative">
                      <textarea 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[120px]"
                        value={editingTask.description || ''}
                        onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                        placeholder="Añade más detalles..."
                      />
                      <AlignLeft size={16} className="absolute top-4 right-5 text-slate-300" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Fecha de Cumplimiento</label>
                      <div className="relative">
                        <input 
                          type="date"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          value={editingTask.due_date || ''}
                          onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                        />
                        <Calendar size={16} className="absolute top-1/2 -translate-y-1/2 right-5 text-slate-300 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Creada el</label>
                      <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-slate-400 font-medium text-sm flex items-center gap-3">
                        <Clock size={16} />
                        {format(new Date(editingTask.created_at), "d 'de' MMMM", { locale: es })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 flex gap-3">
                  <button 
                    onClick={() => handleDeleteTask(editingTask.id)}
                    className="flex-1 py-4 text-rose-500 font-black uppercase tracking-widest text-xs hover:bg-rose-50 rounded-2xl transition-all"
                  >
                    Eliminar
                  </button>
                  <button 
                    onClick={handleUpdateTaskDetails}
                    className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Notes;
