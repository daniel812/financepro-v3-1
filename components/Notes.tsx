
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
  DragEndEvent
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
import { Plus, Trash2, GripVertical, X, Check } from 'lucide-react';

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

const SortableTaskCard = ({ task, onDelete }: { task: Task; onDelete: (id: string) => void }) => {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-3 group relative"
    >
      <div className="flex items-start gap-3">
        <div {...attributes} {...listeners} className="mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors">
          <GripVertical size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-800 text-sm mb-1 truncate">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{task.description}</p>
          )}
        </div>
        <button 
          onClick={() => onDelete(task.id)}
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
  const [newTask, setNewTask] = useState({ title: '', description: '' });

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
        user_id: userId,
        family_admin_id: familyAdminId
      });
      setTasks([...tasks, task]);
      setNewTask({ title: '', description: '' });
      setIsAdding(null);
    } catch (error) {
      console.error("Error creando tarea:", error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await dbService.deleteTask(id);
      setTasks(tasks.filter(t => t.id !== id));
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

    const activeTask = tasks.find(t => t.id === active.id);
    const overId = over.id as string;

    // Find if we are over a column or a task
    const isOverAColumn = COLUMNS.some(c => c.id === overId);
    
    if (activeTask) {
      if (isOverAColumn) {
        const overColumnId = overId as TaskStatus;
        if (activeTask.status !== overColumnId) {
          setTasks(prev => prev.map(t => t.id === active.id ? { ...t, status: overColumnId } : t));
        }
      } else {
        const overTask = tasks.find(t => t.id === overId);
        if (overTask && activeTask.status !== overTask.status) {
          setTasks(prev => prev.map(t => t.id === active.id ? { ...t, status: overTask.status } : t));
        }
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    let newTasks = [...tasks];
    const isOverAColumn = COLUMNS.some(c => c.id === overId);

    if (isOverAColumn) {
      // Just moved to an empty column or same column
      const status = overId as TaskStatus;
      const columnTasks = newTasks.filter(t => t.status === status && t.id !== activeId);
      const maxPos = columnTasks.reduce((max, t) => Math.max(max, t.position), 0);
      
      newTasks = newTasks.map(t => t.id === activeId ? { ...t, status, position: maxPos + 1000 } : t);
    } else {
      const oldIndex = newTasks.findIndex(t => t.id === activeId);
      const newIndex = newTasks.findIndex(t => t.id === overId);
      
      if (oldIndex !== newIndex) {
        const overTask = newTasks[newIndex];
        const status = overTask.status;
        
        // Move within or between columns
        newTasks = arrayMove(newTasks, oldIndex, newIndex);
        
        // Update positions
        const columnTasks = newTasks.filter(t => t.status === status);
        const idxInColumn = columnTasks.findIndex(t => t.id === activeId);
        
        let newPos;
        if (columnTasks.length === 1) {
          newPos = 1000;
        } else if (idxInColumn === 0) {
          newPos = columnTasks[1].position / 2;
        } else if (idxInColumn === columnTasks.length - 1) {
          newPos = columnTasks[idxInColumn - 1].position + 1000;
        } else {
          newPos = (columnTasks[idxInColumn - 1].position + columnTasks[idxInColumn + 1].position) / 2;
        }
        
        newTasks = newTasks.map(t => t.id === activeId ? { ...t, status, position: newPos } : t);
      }
    }

    setTasks(newTasks);
    
    // Persist change
    const updatedTask = newTasks.find(t => t.id === activeId);
    if (updatedTask) {
      try {
        await dbService.updateTask(activeId, { 
          status: updatedTask.status, 
          position: updatedTask.position 
        });
      } catch (error) {
        console.error("Error persistiendo cambio de tarea:", error);
        loadTasks(); // Rollback
      }
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
              <div key={column.id} className="flex-1 flex flex-col min-w-[300px] bg-slate-100/50 rounded-[2rem] p-4 border border-slate-200/50">
                <div className="flex items-center justify-between mb-4 px-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${column.color}`}></div>
                    <h3 className="font-black text-slate-700 uppercase tracking-widest text-xs">{column.label}</h3>
                    <span className="bg-white text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                      {tasks.filter(t => t.status === column.id).length}
                    </span>
                  </div>
                  <button 
                    onClick={() => setIsAdding(column.id)}
                    className="w-8 h-8 flex items-center justify-center bg-white text-slate-400 hover:text-indigo-600 hover:shadow-md rounded-xl transition-all"
                  >
                    <Plus size={18} />
                  </button>
                </div>

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
                            className="w-full text-xs text-slate-500 focus:outline-none resize-none placeholder:text-slate-300"
                            rows={2}
                            value={newTask.description}
                            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                          />
                          <div className="flex justify-end gap-2 mt-3">
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
                        />
                      ))}
                    
                    {tasks.filter(t => t.status === column.id).length === 0 && !isAdding && (
                      <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-300">
                        <p className="text-[10px] font-bold uppercase tracking-widest">Sin tareas</p>
                      </div>
                    )}
                  </SortableContext>
                </div>
              </div>
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
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{activeTask.description}</p>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
};

export default Notes;
