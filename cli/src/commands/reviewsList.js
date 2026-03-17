import ora from 'ora';
import chalk from 'chalk';
import { ApiClient } from '../api/client.js';
import { formatReviewsList } from '../utils/formatter.js';

/**
 * Handler de la commande `polycheck reviews list`
 * @param {object} options
 */
export async function handleReviewsList(options) {
    const apiUrl = options.parent?.opts().apiUrl || process.env.POLYCHECK_API_URL || 'http://localhost:3001';
    const client = new ApiClient(apiUrl);

    const page  = parseInt(options.page || '1', 10);
    const limit = parseInt(options.limit || '20', 10);

    const spinner = ora({ text: 'Chargement des reviews…', spinner: 'dots' }).start();

    try {
        const data = await client.listReviews(page, limit);
        spinner.succeed('Reviews chargées.');
        console.log(formatReviewsList(data));
    } catch (err) {
        spinner.fail('Échec du chargement.');
        console.error(chalk.red(`\n  ${err.message}`));
        process.exit(1);
    }
}
