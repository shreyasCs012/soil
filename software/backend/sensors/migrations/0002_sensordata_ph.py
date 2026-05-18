# Generated manually to align API data with frontend sensor views.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sensors', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sensordata',
            name='ph',
            field=models.FloatField(default=6.8),
        ),
    ]
