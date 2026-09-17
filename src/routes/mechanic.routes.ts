import { Router } from 'express';
import { MechanicController } from '../controllers/MechanicController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureAdmin } from '../middlewares/ensureAdmin';

const mechanicRoutes = Router();
const mechanicController = new MechanicController();


mechanicRoutes.get('/guide', mechanicController.getGuideMechanics);


mechanicRoutes.get('/admin', ensureAuthenticated, ensureAdmin, mechanicController.getAllForAdmin);
mechanicRoutes.post('/bulk', ensureAuthenticated, ensureAdmin, mechanicController.bulkCreate);
mechanicRoutes.post('/', ensureAuthenticated, ensureAdmin, mechanicController.createMechanic);
mechanicRoutes.patch('/:id', ensureAuthenticated, ensureAdmin, mechanicController.updateMechanic);
mechanicRoutes.delete('/:id', ensureAuthenticated, ensureAdmin, mechanicController.deleteMechanic);

export { mechanicRoutes };