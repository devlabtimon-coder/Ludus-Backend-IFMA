import { Router } from 'express';
import { MechanicController } from '../controllers/MechanicController';

const mechanicRoutes = Router();
const mechanicController = new MechanicController();

mechanicRoutes.get('/guide', mechanicController.getGuideMechanics);
mechanicRoutes.get('/admin', mechanicController.getAllForAdmin);
mechanicRoutes.post('/bulk', mechanicController.bulkCreate);


mechanicRoutes.post('/', mechanicController.createMechanic);
mechanicRoutes.patch('/:id', mechanicController.updateMechanic);
mechanicRoutes.delete('/:id', mechanicController.deleteMechanic);

export { mechanicRoutes };